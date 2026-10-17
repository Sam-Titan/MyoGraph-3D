"""Print what is inside the built GLBs: nodes, triangles, attributes, materials, extras.

Usage: python scripts/inspect_glb.py [file.glb ...]   (default: heart.glb and heart.mobile.glb)
Stdlib + numpy only; also imported by backend/tests/test_anatomy.py via `read_glb`.
"""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

import numpy as np

MODELS = Path(__file__).resolve().parents[1] / "frontend" / "public" / "models"
DEFAULT_FILES = (MODELS / "heart.glb", MODELS / "heart.mobile.glb")
_DTYPES = {5120: "i1", 5121: "u1", 5122: "i2", 5123: "u2", 5125: "u4", 5126: "f4"}
_WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def read_glb(path: Path) -> tuple[dict, bytes]:
    """The GLB's JSON document and its binary chunk."""
    data = path.read_bytes()
    magic, _version, length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or length != len(data):
        raise ValueError(f"{path}: not a valid GLB")
    doc, blob, offset = {}, b"", 12
    while offset < length:
        size, kind = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8 : offset + 8 + size]
        if kind == 0x4E4F534A:
            doc = json.loads(chunk)
        elif kind == 0x004E4942:
            blob = chunk
        offset += 8 + size
    return doc, blob


def accessor(doc: dict, blob: bytes, index: int) -> np.ndarray:
    """Decode accessor `index` into an (count, width) array (no sparse / interleaved support)."""
    acc = doc["accessors"][index]
    view = doc["bufferViews"][acc["bufferView"]]
    width = _WIDTH[acc["type"]]
    dtype = np.dtype("<" + _DTYPES[acc["componentType"]])
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    arr = np.frombuffer(blob, dtype=dtype, count=acc["count"] * width, offset=start)
    return arr.reshape(acc["count"], width)


def node_summaries(path: Path) -> dict[str, dict]:
    """Per mesh node: triangles, vertices, attribute names, material, extras."""
    doc, blob = read_glb(path)
    out: dict[str, dict] = {}
    for node in doc["nodes"]:
        if "mesh" not in node:
            continue
        prim = doc["meshes"][node["mesh"]]["primitives"][0]
        material = doc.get("materials", [{}])[prim["material"]] if "material" in prim else None
        out[node["name"]] = {
            "triangles": doc["accessors"][prim["indices"]]["count"] // 3,
            "vertices": doc["accessors"][prim["attributes"]["POSITION"]]["count"],
            "attributes": {
                name: f"{doc['accessors'][i]['type']} {_DTYPES[doc['accessors'][i]['componentType']]}"
                for name, i in prim["attributes"].items()
            },
            "material": material,
            "extras": node.get("extras", {}),
            "territory": (
                accessor(doc, blob, prim["attributes"]["_TERRITORY"])
                if "_TERRITORY" in prim["attributes"]
                else None
            ),
        }
    return out


def main(files: list[Path]) -> int:
    for path in files:
        nodes = node_summaries(path)
        total = sum(n["triangles"] for n in nodes.values())
        print(f"\n=== {path.name}  {path.stat().st_size / 1e6:.2f} MB  {total} triangles ===")
        for name, n in nodes.items():
            mat = n["material"]
            mat_text = "NONE" if mat is None else (mat.get("name") or "unnamed")
            print(
                f"{name:16}{n['triangles']:7d} tris {n['vertices']:7d} verts  material: {mat_text}"
            )
            print("    attributes:", ", ".join(f"{k}({v})" for k, v in n["attributes"].items()))
            extras = {k: v for k, v in n["extras"].items() if k != "anchor"}
            print("    extras:", json.dumps(extras, separators=(",", ":")))
            if n["territory"] is not None:
                t = n["territory"]
                cols = n["extras"].get("territoryChannels", [])
                print(f"    _TERRITORY {t.shape}, per channel max/mean/share>0.5:")
                for i, ch in enumerate(cols):
                    print(
                        f"      {ch:6} max {t[:, i].max():.2f}  mean {t[:, i].mean():.3f}"
                        f"  share>0.5 {(t[:, i] > 0.5).mean():.1%}"
                    )
    return 0


if __name__ == "__main__":
    sys.exit(main([Path(a) for a in sys.argv[1:]] or list(DEFAULT_FILES)))
