"""Build frontend/public/models/heart.glb from BodyParts3D 4.0 using config/anatomy.yaml.

Run via `make assets`. Reads the zip in place (no extraction). The zip holds FJ<n>.obj files; the
link to FMA ids is the parts list (FMA -> BP id) joined with each OBJ header ("Representation ID").

Output frame: Y-up, anterior = +Z, patient's left = +X, ~2 scene units tall, origin at the heart
(area-weighted surface) centroid. Source frame is LPS (x = left, y = posterior, z = superior), mm.
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
import yaml

ROOT = Path(__file__).resolve().parents[1]
ANATOMY = ROOT / "config" / "anatomy.yaml"
BP3D_DIR = ROOT / "data" / "raw" / "bp3d"
ZIP_NAME = "isa_BP3D_4.0_obj_99.zip"
PARTS_NAME = "isa_parts_list_e.txt"
HEART_NODE_TARGET_HEIGHT = 2.0  # scene units (Y extent of the node that carries target CAD)
TOTAL_TRIANGLE_LIMIT = 80_000
GLB_SIZE_LIMIT = 3_000_000
SIDE_AXIS = {"anterior": (2, +1), "posterior": (2, -1), "left": (0, +1), "right": (0, -1)}
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
    node: dict, parts: dict[str, tuple[str, str]], index: dict[str, list[tuple[str, str]]]
) -> tuple[list[tuple[str, str]], list[str]]:
    """Unique (FJ id, member) files for a node, plus human-readable log rows."""
    files: dict[str, str] = {}
    rows: list[str] = []
    for entry in node["fma"]:
        alts = entry if isinstance(entry, list) else [entry]
        found = [(a, index.get(parts[a][0], [])) for a in alts if a in parts]
        pick = next(((a, fs) for a, fs in found if fs), None)
        if pick is None:
            rows.append(f"    MISSING {'|'.join(alts)} (no .obj; composite or absent)")
            log.warning("node %s: %s has no geometry", node["name"], "|".join(alts))
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


def surface_centroid(mesh: trimesh.Trimesh) -> np.ndarray:
    """Area-weighted surface centroid (independent of tessellation density)."""
    area = mesh.area_faces
    return mesh.triangles_center.T @ area / area.sum()


def surface_anchor(vessel: trimesh.Trimesh, heart: trimesh.Trimesh) -> np.ndarray:
    """A point ON the vessel surface for its label.

    A vessel's centroid can lie inside the heart (RCA's does), which would hide the label. If the
    centroid is inside the heart's convex hull, take the vertex farthest outward along the vessel's
    mean direction from the heart centroid; otherwise the vertex nearest the centroid. Always a real
    vertex, and argmax/argmin pick the first hit, so the result is deterministic.
    """
    c, hc = surface_centroid(vessel), surface_centroid(heart)
    verts = np.asarray(vessel.vertices)
    hull = heart.convex_hull  # convex, so "inside" = behind every face plane (no rtree needed)
    if np.all(np.einsum("ij,ij->i", hull.face_normals, c - hull.triangles_center) <= 0):
        d = c - hc
        d = d / np.linalg.norm(d)
        return verts[int(np.argmax((verts - hc) @ d))]
    return verts[int(np.argmin(np.linalg.norm(verts - c, axis=1)))]


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


def main() -> int:
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")
    cfg = yaml.safe_load(ANATOMY.read_text())
    nodes: list[dict] = cfg["nodes"]
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
        for node in nodes:
            files, rows = resolve_node(node, parts, index)
            print(f"{node['name']:7} {len(files):3} unique file(s)")
            print("\n".join(rows))
            for fj, _ in files:
                if fj in owner and owner[fj] != node["name"]:
                    failures.append(f"{fj} assigned to both {owner[fj]} and {node['name']}")
                owner[fj] = node["name"]
            if not files and not node.get("optional"):
                failures.append(f"node {node['name']} has no geometry (use the tube fallback)")
            resolved[node["name"]] = files
        if failures:
            print("\nFAIL:\n  " + "\n  ".join(failures))
            return 1
        for node in nodes:
            if resolved[node["name"]]:
                meshes[node["name"]] = load_node_mesh(z, resolved[node["name"]])

    # --- frame: recentre on the heart centroid, scale, Z-up(LPS) -> Y-up ---
    heart = next(n for n in nodes if n.get("target") == "CAD")["name"]
    origin = surface_centroid(meshes[heart])
    height_mm = float(np.ptp(meshes[heart].vertices[:, 2]))  # LPS z = superior
    scale = HEART_NODE_TARGET_HEIGHT / height_mm
    final: dict[str, trimesh.Trimesh] = {}
    table: list[tuple[str, int, int]] = []
    for node in nodes:
        name = node["name"]
        if name not in meshes:
            continue
        m = meshes[name].copy()
        m.vertices = ((m.vertices - origin) * scale) @ LPS_TO_YUP.T
        before = len(m.faces)
        m = decimate(m, int(node["max_triangles"]))
        final[name] = m
        table.append((name, before, len(m.faces)))

    scene = trimesh.Scene()
    extras: dict[str, dict] = {}
    for node in nodes:
        name = node["name"]
        if name in final:
            scene.add_geometry(final[name], node_name=name, geom_name=name)
            extras[name] = {
                "target": node.get("target"),
                "optional": bool(node.get("optional", False)),
                "defaultVisible": bool(node.get("default_visible", True)),
                # Label anchor: a point on the node's surface (see surface_anchor).
                "anchor": [round(float(v), 4) for v in surface_anchor(final[name], final[heart])],
            }
    glb = inject_extras(scene.export(file_type="glb"), extras)
    out = ROOT / cfg["output"]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(glb)

    # --- report ---
    print("\n== triangles (before -> after decimation) ==")
    print(f"{'node':8}{'before':>9}{'after':>9}{'budget':>9}")
    budget = {n["name"]: n["max_triangles"] for n in nodes}
    for name, b, a in table:
        print(f"{name:8}{b:9d}{a:9d}{budget[name]:9d}")
    total_before, total = sum(t[1] for t in table), sum(t[2] for t in table)
    print(f"{'TOTAL':8}{total_before:9d}{total:9d}{TOTAL_TRIANGLE_LIMIT:9d} (limit, strict <)")
    print(
        f"\nGLB: {out.relative_to(ROOT)}  {len(glb) / 1e6:.2f} MB "
        f"(limit {GLB_SIZE_LIMIT / 1e6:.0f} MB)"
    )
    print(
        f"scale: {scale:.5f} units/mm "
        f"(heart height {height_mm:.0f} mm -> {HEART_NODE_TARGET_HEIGHT})"
    )

    print(
        "\n== sanity: area-weighted centroids, output frame "
        "(+X patient left, +Y up, +Z anterior) =="
    )
    hc = surface_centroid(final[heart])
    print(f"{heart:7} centroid ({hc[0]:+.3f}, {hc[1]:+.3f}, {hc[2]:+.3f})  [reference]")
    checks: list[str] = []
    for node in nodes:
        side = node.get("expect_side")
        if not side or node["name"] not in final:
            continue
        c = surface_centroid(final[node["name"]])
        axis, sign = SIDE_AXIS[side]
        delta = (c[axis] - hc[axis]) * sign
        ok = delta > 0
        label = "xyz"[axis]
        print(
            f"{node['name']:7} centroid ({c[0]:+.3f}, {c[1]:+.3f}, {c[2]:+.3f})  "
            f"{label} vs heart {c[axis] - hc[axis]:+.3f} -> "
            f"expected {side}: {'OK' if ok else 'FAIL'}"
        )
        if not ok:
            checks.append(f"{node['name']} not {side} of heart centroid")
    print("\n== label anchors (on-surface points; used by <Html> labels) ==")
    for node in nodes:
        name = node["name"]
        if not node.get("target") or name not in final or name == heart:
            continue
        a = np.array(extras[name]["anchor"])
        dist = float(np.linalg.norm(final[name].vertices - a, axis=1).min())
        c = surface_centroid(final[name])
        print(
            f"{name:7} anchor ({a[0]:+.3f}, {a[1]:+.3f}, {a[2]:+.3f})  "
            f"{np.linalg.norm(a - c):.3f} from centroid, {dist:.4f} from nearest vertex"
        )
        if dist > 1e-3:
            checks.append(f"{name} anchor is not on its mesh")
    if total >= TOTAL_TRIANGLE_LIMIT:
        checks.append(f"total triangles {total} >= {TOTAL_TRIANGLE_LIMIT}")
    if len(glb) >= GLB_SIZE_LIMIT:
        checks.append(f"GLB {len(glb)} bytes >= {GLB_SIZE_LIMIT}")
    if checks:
        print("\nFAIL:\n  " + "\n  ".join(checks))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
