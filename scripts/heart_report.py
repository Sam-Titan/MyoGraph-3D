"""Console reports for build_heart_glb.py (sanity checks return failure strings)."""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np
import trimesh
from heart_geometry import InflateReport
from heart_views import SIDE_AXIS, ViewFrame, surface_centroid, view_direction, view_report

if TYPE_CHECKING:
    from ml.anatomy import Anatomy

INFLATE_WARN_BELOW = 0.5  # warn when the edge-length cap removes more than half the request


def inflate_table(reports: dict[str, InflateReport]) -> list[str]:
    """Requested vs applied inflation per node; returns the failure/warning rows (also printed)."""
    print("\n== inflate (source mm; capped per vertex by inflate_edge_ratio x edge length) ==")
    print(f"{'node':16}{'requested':>10}{'mean':>8}{'max':>8}{'capped':>8}{'kept':>7}")
    warnings: list[str] = []
    for name, r in reports.items():
        print(
            f"{name:16}{r.requested_mm:10.2f}{r.mean_applied_mm:8.2f}{r.max_applied_mm:8.2f}"
            f"{r.capped_share:8.0%}{r.kept:7.0%}"
        )
        if r.kept < INFLATE_WARN_BELOW:
            warnings.append(
                f"WARNING {name}: edge-length cap keeps only {r.kept:.0%} of the requested "
                f"{r.requested_mm} mm (raise inflate_edge_ratio or lower the request)"
            )
    print("\n".join(warnings))
    return warnings


def sanity_report(
    anatomy: Anatomy,
    final: dict[str, trimesh.Trimesh],
    extras: dict[str, dict],
    anchor_how: dict[str, str],
    reference: dict[str, trimesh.Trimesh],
) -> list[str]:
    """Print centroid-side and label-anchor checks; return the failures.

    The side check uses `reference` (framed, NOT inflated): thickening adds more area to thin distal
    branches than to the trunk, which moves an area-weighted centroid without moving the vessel.
    """
    heart = anatomy.muscle().name
    print("\n== sanity: area-weighted centroids (+X patient left, +Y up, +Z anterior) ==")
    hc = surface_centroid(reference[heart])
    print(f"{heart:7} centroid ({hc[0]:+.3f}, {hc[1]:+.3f}, {hc[2]:+.3f})  [reference]")
    checks: list[str] = []
    for node in anatomy.nodes:
        if not node.expect_side or node.name not in reference:
            continue
        c = surface_centroid(reference[node.name])
        axis, sign = SIDE_AXIS[node.expect_side]
        ok = (c[axis] - hc[axis]) * sign > 0
        print(
            f"{node.name:7} centroid ({c[0]:+.3f}, {c[1]:+.3f}, {c[2]:+.3f})  "
            f"{'xyz'[axis]} vs heart {c[axis] - hc[axis]:+.3f} -> "
            f"expected {node.expect_side}: {'OK' if ok else 'FAIL'}"
        )
        if not ok:
            checks.append(f"{node.name} not {node.expect_side} of heart centroid")
    print("\n== label anchors (on-surface points; used by <Html> labels) ==")
    for node in anatomy.nodes:
        name = node.name
        if not node.target or name not in final or name == heart:
            continue
        a = np.array(extras[name]["anchor"])
        dist = float(np.linalg.norm(final[name].vertices - a, axis=1).min())
        c = surface_centroid(final[name])
        print(
            f"{name:7} anchor ({a[0]:+.3f}, {a[1]:+.3f}, {a[2]:+.3f})  "
            f"{np.linalg.norm(a - c):.3f} from centroid, {dist:.4f} from nearest vertex, "
            f"rule: {anchor_how[name]}"
        )
        if dist > 1e-3:
            checks.append(f"{name} anchor is not on its mesh")
    return checks


def placement_report(
    anatomy: Anatomy,
    final: dict[str, trimesh.Trimesh],
    extras: dict[str, dict],
    frame: ViewFrame,
) -> None:
    heart = anatomy.muscle().name
    targets = [n.name for n in anatomy.nodes if n.target and n.name in final and n.name != heart]
    print("\n== label placement per view (CameraRig framing; label boxes assume 72x22 px) ==")
    views = {"default": frame}
    for n in anatomy.nodes:
        d = view_direction(n.model_dump())
        if n.name in targets and d is not None:
            views[n.name] = ViewFrame([final[n.name]], d)
    print(
        "\n".join(
            view_report(
                {n: np.array(extras[n]["anchor"]) for n in targets},
                {n: bool(extras[n]["anchorHidden"]) for n in targets},
                {n: final[n] for n in targets},
                final[heart],
                views,
            )
        )
    )
