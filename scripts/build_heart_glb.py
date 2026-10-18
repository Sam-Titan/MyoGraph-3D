"""Build frontend/public/models/heart.glb and heart.mobile.glb from BodyParts3D 4.0 (config/anatomy.yaml).

Run via `make assets`. Reads the zip in place (no extraction). The zip holds FJ<n>.obj files; the
link to FMA ids is the parts list (FMA -> BP id) joined with each OBJ header ("Representation ID").

Output frame: Y-up, anterior = +Z, patient's left = +X, ~2 scene units tall, origin at the heart
(area-weighted surface) centroid. Source frame is LPS (x = left, y = posterior, z = superior), mm.

Vessels are thickened (`inflate`), then each LOD is decimated and the heart gets the `_TERRITORY`
vertex attribute (supply-region weights) computed on that LOD's final vertices.
"""

from __future__ import annotations

import collections
import io
import json
import logging
import re
import struct
import sys
import zipfile
from pathlib import Path

import numpy as np
import trimesh
from heart_geometry import InflateReport, inflate, territory_weights
from heart_report import inflate_table, placement_report, sanity_report
from heart_views import ViewFrame, surface_anchor, surface_centroid
from heart_views import view_direction as view_dir

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from ml.anatomy import ANATOMY_PATH, Anatomy, Node, load_anatomy  # noqa: E402

BP3D_DIR = ROOT / "data" / "raw" / "bp3d"
ZIP_NAME = "isa_BP3D_4.0_obj_99.zip"
PARTS_NAME = "isa_parts_list_e.txt"
HEART_NODE_TARGET_HEIGHT = 2.0  # scene units (Y extent of the node that carries target CAD)
# LPS (x left, y posterior, z superior) -> Y-up with anterior +Z, left +X. Proper rotation (det +1).
LPS_TO_YUP = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], dtype=float)

log = logging.getLogger("build_heart_glb")


def index_zip(z: zipfile.ZipFile) -> dict[str, list[tuple[str, str]]]:
    """BP representation id -> [(FJ file id, zip member name)] from each OBJ header."""
    index: dict[str, list[tuple[str, str]]] = collections.defaultdict(list)
    for info in z.infolist():
        if not info.filename.endswith(".obj"):
            continue
        with z.open(info) as fh:
            m = re.search(r"Representation ID : (BP\d+)", fh.read(900).decode("latin1"))
        if m:
            index[m.group(1)].append((Path(info.filename).stem, info.filename))
    return index


def read_parts_list(path: Path) -> dict[str, tuple[str, str]]:
    """FMA concept id -> (BP representation id, English name)."""
    rows = path.read_text().splitlines()[1:]
    return {c: (b, n) for c, b, n in (r.split("\t") for r in rows if r.strip())}


def resolve_node(
    node: Node,
    parts: dict[str, tuple[str, str]],
    index: dict[str, list[tuple[str, str]]],
) -> tuple[list[tuple[str, str]], list[str]]:
    """Unique (FJ id, member) files for a node, plus human-readable log rows."""
    files: dict[str, str] = {}
    rows: list[str] = []
    for entry in node.fma:
        alts = entry if isinstance(entry, list) else [entry]
        found = [(a, index.get(parts[a][0], [])) for a in alts if a in parts]
        pick = next(((a, fs) for a, fs in found if fs), None)
        if pick is None:
            rows.append(f"    MISSING {'|'.join(alts)} (no .obj; composite or absent)")
            log.warning("node %s: %s has no geometry", node.name, "|".join(alts))
            continue
        fma, fs = pick
        dup = sum(1 for fj, _ in fs if fj in files)
        files.update({fj: member for fj, member in fs})
        rows.append(
            f"    found   {fma:9} {len(fs):2} file(s) {parts[fma][1]}"
            + (f"  [{dup} already merged]" if dup else "")
        )
    return sorted(files.items()), rows


def load_node_mesh(z: zipfile.ZipFile, files: list[tuple[str, str]]) -> trimesh.Trimesh:
    meshes = [
        trimesh.load(io.BytesIO(z.read(member)), file_type="obj", force="mesh", process=True)
        for _, member in files
    ]
    return trimesh.util.concatenate(meshes)


def decimate(mesh: trimesh.Trimesh, budget: int) -> trimesh.Trimesh:
    if len(mesh.faces) <= budget:
        return mesh
    out = mesh.simplify_quadric_decimation(face_count=budget)
    out.merge_vertices()
    return out


def inject_extras(glb: bytes, extras_by_node: dict[str, dict]) -> bytes:
    """Add glTF `extras` (three.js userData) to named nodes in a GLB."""
    magic, version, _ = struct.unpack_from("<III", glb, 0)
    jlen, jtype = struct.unpack_from("<II", glb, 12)
    assert jtype == 0x4E4F534A, "first GLB chunk is not JSON"
    doc = json.loads(glb[20 : 20 + jlen])
    for n in doc["nodes"]:
        if n.get("name") in extras_by_node and "mesh" in n:
            n["extras"] = extras_by_node[n["name"]]
    body = json.dumps(doc, separators=(",", ":")).encode()
    body += b" " * (-len(body) % 4)
    rest = glb[20 + jlen :]
    total = 12 + 8 + len(body) + len(rest)
    return (
        struct.pack("<III", magic, version, total)
        + struct.pack("<II", len(body), jtype)
        + body
        + rest
    )


def frame_mesh(m: trimesh.Trimesh, origin: np.ndarray, scale: float) -> trimesh.Trimesh:
    out = m.copy()
    out.vertices = ((out.vertices - origin) * scale) @ LPS_TO_YUP.T
    return out


def build_lod(
    anatomy: Anatomy, framed: dict[str, trimesh.Trimesh], scale: float, mobile: bool
) -> tuple[bytes, dict[str, trimesh.Trimesh], dict[str, dict], dict[str, str], ViewFrame]:
    """Decimate every node to the LOD budget, attach territory weights and export one GLB."""
    final: dict[str, trimesh.Trimesh] = {}
    for node in anatomy.nodes:
        if node.name in framed:
            budget = node.max_triangles_mobile if mobile else node.max_triangles
            final[node.name] = decimate(framed[node.name], budget)
    heart = anatomy.muscle().name
    channels = [n.name for n in anatomy.territory_nodes()]
    # Weights on the FINAL heart vertices of this LOD, so the data always matches the mesh it rides on.
    final[heart].vertex_attributes["_TERRITORY"] = territory_weights(
        final[heart].vertices,
        [final[c] for c in channels],
        scale,
        [anatomy.territory_scale(n)[0] for n in anatomy.territory_nodes()],
        [anatomy.territory_scale(n)[1] for n in anatomy.territory_nodes()],
    )
    frame = ViewFrame(
        [final[n.name] for n in anatomy.nodes if n.name in final and n.default_visible]
    )
    scene = trimesh.Scene()
    extras: dict[str, dict] = {}
    anchor_how: dict[str, str] = {}
    for node in anatomy.nodes:
        if node.name not in final:
            continue
        scene.add_geometry(final[node.name], node_name=node.name, geom_name=node.name)
        anchor_pt, anchor_how[node.name] = surface_anchor(
            final[node.name], final[heart], frame, node.expect_side
        )
        view = view_dir(node.model_dump())
        extras[node.name] = {
            "target": node.target,
            "role": node.role,
            "optional": node.optional,
            "defaultVisible": node.default_visible,
            # Label anchor: a point on the node's surface (see surface_anchor).
            "anchor": [round(float(v), 4) for v in anchor_pt],
            # True when no near-tie vertex is visible from the default view (heart is in front).
            "anchorHidden": anchor_how[node.name].endswith("-hidden"),
            # Camera direction (target -> camera) when this node is selected; null keeps the default view.
            "viewDir": [round(float(v), 4) for v in view] if view is not None else None,
        }
    # Which node each column of the heart's `_TERRITORY` attribute belongs to.
    extras[heart]["territoryChannels"] = channels
    return inject_extras(scene.export(file_type="glb"), extras), final, extras, anchor_how, frame


def lod_report(
    label: str,
    out: Path,
    glb: bytes,
    final: dict[str, trimesh.Trimesh],
    anatomy: Anatomy,
    before: dict[str, int],
    mobile: bool,
) -> list[str]:
    """Print the triangle table for one LOD; return budget failures."""
    limit = anatomy.budget_mobile if mobile else anatomy.budget_desktop
    print(f"\n== {label}: triangles (before decimation -> after) ==")
    print(f"{'node':16}{'before':>9}{'after':>9}{'budget':>9}")
    for n in anatomy.nodes:
        if n.name in final:
            b = n.max_triangles_mobile if mobile else n.max_triangles
            print(f"{n.name:16}{before[n.name]:9d}{len(final[n.name].faces):9d}{b:9d}")
    total = sum(len(m.faces) for m in final.values())
    print(f"{'TOTAL':16}{'':9}{total:9d}{limit.max_triangles:9d} (limit, strict <)")
    print(
        f"GLB: {out.relative_to(ROOT)}  {len(glb) / 1e6:.2f} MB (limit {limit.max_bytes / 1e6:.0f} MB)"
    )
    fails = []
    if total >= limit.max_triangles:
        fails.append(f"{label}: total triangles {total} >= {limit.max_triangles}")
    if len(glb) > limit.max_bytes:
        fails.append(f"{label}: GLB {len(glb)} bytes > {limit.max_bytes}")
    return fails


def main() -> int:
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")
    anatomy = load_anatomy(ANATOMY_PATH)
    zip_path, parts_path = BP3D_DIR / ZIP_NAME, BP3D_DIR / PARTS_NAME
    for p in (zip_path, parts_path):
        if not p.exists():
            print(f"FAIL: missing {p.relative_to(ROOT)} (see config/anatomy.yaml header)")
            return 1

    parts = read_parts_list(parts_path)
    failures: list[str] = []
    resolved: dict[str, list[tuple[str, str]]] = {}
    owner: dict[str, str] = {}
    meshes: dict[str, trimesh.Trimesh] = {}
    with zipfile.ZipFile(zip_path) as z:
        index = index_zip(z)
        print(f"zip: {len(index)} representations; parts list: {len(parts)} concepts\n")
        print("== found / missing per node ==")
        for node in anatomy.nodes:
            files, rows = resolve_node(node, parts, index)
            print(f"{node.name:16} {len(files):3} unique file(s)")
            print("\n".join(rows))
            for fj, _ in files:
                if fj in owner and owner[fj] != node.name:
                    failures.append(f"{fj} assigned to both {owner[fj]} and {node.name}")
                owner[fj] = node.name
            if not files and not node.optional:
                failures.append(f"node {node.name} has no geometry (use the tube fallback)")
            resolved[node.name] = files
        if failures:
            print("\nFAIL:\n  " + "\n  ".join(failures))
            return 1
        for node in anatomy.nodes:
            if resolved[node.name]:
                meshes[node.name] = load_node_mesh(z, resolved[node.name])

    raw = dict(meshes)  # un-inflated, for the sanity checks
    # --- thicken vessels in source millimetres (before framing and decimation) ---
    inflate_reports: dict[str, InflateReport] = {}
    for node in anatomy.nodes:
        if node.inflate > 0 and node.name in meshes:
            meshes[node.name], inflate_reports[node.name] = inflate(
                meshes[node.name], node.inflate, anatomy.inflate_edge_ratio
            )
    warnings = inflate_table(inflate_reports)

    # --- frame: recentre on the heart centroid, scale, Z-up(LPS) -> Y-up ---
    heart = anatomy.muscle().name
    origin = surface_centroid(meshes[heart])
    height_mm = float(np.ptp(meshes[heart].vertices[:, 2]))  # LPS z = superior
    scale = HEART_NODE_TARGET_HEIGHT / height_mm
    framed = {name: frame_mesh(m, origin, scale) for name, m in meshes.items()}
    reference = {name: frame_mesh(m, origin, scale) for name, m in raw.items()}
    before = {name: len(m.faces) for name, m in framed.items()}
    print(
        f"\nscale: {scale:.5f} units/mm (heart height {height_mm:.0f} mm -> {HEART_NODE_TARGET_HEIGHT})"
    )

    checks: list[str] = []
    for mobile in (False, True):
        label = "mobile" if mobile else "desktop"
        glb, final, extras, anchor_how, frame = build_lod(anatomy, framed, scale, mobile)
        out = ROOT / (anatomy.output_mobile if mobile else anatomy.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(glb)
        checks += lod_report(label, out, glb, final, anatomy, before, mobile)
        checks += [
            f"{label}: {c}" for c in sanity_report(anatomy, final, extras, anchor_how, reference)
        ]
        if not mobile:
            placement_report(anatomy, final, extras, frame)
    if warnings:
        checks += warnings
    if checks:
        print("\nFAIL:\n  " + "\n  ".join(checks))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
