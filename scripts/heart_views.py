"""Camera views, label anchors and the label placement report for build_heart_glb.py.

Everything here mirrors the frontend (frontend/src/features/heart3d/CameraRig.tsx, Labels.tsx):
the default anterior view, rotate-on-select views derived from `expect_side` (or an explicit
`view_dir` in config/anatomy.yaml), and the rule that places a hidden vessel's label just outside
the heart's screen silhouette. Output frame: Y-up, anterior +Z, patient's left +X.
"""

from __future__ import annotations

import numpy as np
import trimesh

SIDE_AXIS = {
    "anterior": (2, +1),
    "posterior": (2, -1),
    "left": (0, +1),
    "right": (0, -1),
}
# Camera azimuth per side, degrees from +Z (anterior) toward +X (patient's left).
SIDE_AZIMUTH_DEG = {"anterior": 0.0, "right": -45.0, "left": 110.0, "posterior": 180.0}
VIEW_ELEVATION_DEG = float(
    np.degrees(np.arctan(0.35))
)  # the default view's slight elevation
CAMERA_FOV_DEG = 35.0
FILL_HEIGHT, FILL_WIDTH = (
    0.7,
    0.9,
)  # share of viewport height / width the framed box may fill
ANCHOR_MIN_FACING = 0.2  # min dot(vertex normal, view dir): clearly facing the camera
ANCHOR_TIE_FRACTION = (
    0.05  # "near-tie": within this share of the node's extent along side_dir
)
ANCHOR_MAX_CANDIDATES = 300  # deterministic stride subsample for the occlusion test
REPORT_ASPECTS = (0.75, 1.5)  # 3-column workspace (narrow) and stacked / wide viewport
REPORT_HEIGHT_PX = 700
REPORT_LABEL_PX = (
    14  # a label "sits on" a vessel if one of its vertices projects this close
)
REPORT_SAMPLES = 300  # vertices per vessel (fixed stride) for the visibility report
LABEL_W_PX, LABEL_H_PX, SILHOUETTE_GAP_PX = 72, 22, 12


def surface_centroid(mesh: trimesh.Trimesh) -> np.ndarray:
    """Area-weighted surface centroid (independent of tessellation density)."""
    area = mesh.area_faces
    return mesh.triangles_center.T @ area / area.sum()


def side_direction(side: str) -> np.ndarray:
    """Unit vector in the output frame for an `expect_side` value (anterior -> +Z, left -> +X, ...)."""
    axis, sign = SIDE_AXIS[side]
    d = np.zeros(3)
    d[axis] = sign
    return d


def azimuth_direction(azimuth_deg: float) -> np.ndarray:
    """Unit camera direction (target -> camera) at the default elevation and given azimuth."""
    az, el = np.radians(azimuth_deg), np.radians(VIEW_ELEVATION_DEG)
    return np.array([np.sin(az) * np.cos(el), np.sin(el), np.cos(az) * np.cos(el)])


DEFAULT_VIEW_DIR = azimuth_direction(SIDE_AZIMUTH_DEG["anterior"])


def view_direction(node: dict) -> np.ndarray | None:
    """Camera direction for selecting `node`: its `view_dir`, else derived from `expect_side`."""
    if node.get("view_dir"):
        d = np.asarray(node["view_dir"], dtype=float)
        return d / np.linalg.norm(d)
    if node.get("expect_side"):
        return azimuth_direction(SIDE_AZIMUTH_DEG[node["expect_side"]])
    return None


class ViewFrame:
    """A camera looking at the centre of `meshes`' box from `view_dir`, framed like CameraRig."""

    def __init__(
        self, meshes: list[trimesh.Trimesh], view_dir: np.ndarray = DEFAULT_VIEW_DIR
    ) -> None:
        verts = np.vstack([m.vertices for m in meshes])
        lo, hi = verts.min(axis=0), verts.max(axis=0)
        self.view_dir = view_dir
        self.centre = (lo + hi) / 2
        self.right = np.cross([0.0, 1.0, 0.0], view_dir)
        self.right /= np.linalg.norm(self.right)
        self.up = np.cross(view_dir, self.right)
        corners = np.array(
            [
                [x, y, z]
                for x in (lo[0], hi[0])
                for y in (lo[1], hi[1])
                for z in (lo[2], hi[2])
            ]
        )
        rel = corners - self.centre
        self.half_w = float(np.abs(rel @ self.right).max())
        self.half_h = float(np.abs(rel @ self.up).max())
        self.half_d = float(np.abs(rel @ view_dir).max())
        self.tan_v = float(np.tan(np.radians(CAMERA_FOV_DEG) / 2))

    def eye(self, aspect: float) -> np.ndarray:
        tan_h = self.tan_v * aspect
        dist = max(
            self.half_h / (self.tan_v * FILL_HEIGHT), self.half_w / (tan_h * FILL_WIDTH)
        )
        return self.centre + self.view_dir * (dist + self.half_d)

    def project(self, pts: np.ndarray, aspect: float) -> tuple[np.ndarray, np.ndarray]:
        """(pixel xy at REPORT_HEIGHT_PX, depth) of world points; camera at `eye(aspect)`."""
        rel = np.atleast_2d(pts) - self.eye(aspect)
        depth = rel @ -self.view_dir
        x = (rel @ self.right) / (depth * self.tan_v * aspect)
        y = (rel @ self.up) / (depth * self.tan_v)
        w, h = REPORT_HEIGHT_PX * aspect, REPORT_HEIGHT_PX
        return np.stack([(x + 1) / 2 * w, (1 - y) / 2 * h], axis=1), depth


def occluder_count(points: np.ndarray, eye: np.ndarray, tris: np.ndarray) -> np.ndarray:
    """For each point: how many triangles lie strictly between it and `eye` (Moller-Trumbore)."""
    v0, e1, e2 = tris[:, 0], tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0]
    out = np.zeros(len(points), dtype=int)
    for i, p in enumerate(points):
        d = p - eye
        dist = np.linalg.norm(d)
        d = d / dist
        h = np.cross(d, e2)
        a = np.einsum("ij,ij->i", e1, h)
        ok = np.abs(a) > 1e-12
        f = 1.0 / np.where(ok, a, 1.0)
        s = eye - v0
        u = f * np.einsum("ij,ij->i", s, h)
        q = np.cross(s, e1)
        v = f * (q @ d)
        t = f * np.einsum("ij,ij->i", e2, q)
        hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 1e-4) & (t < dist - 1e-3)
        out[i] = int(hit.sum())
    return out


def surface_anchor(
    vessel: trimesh.Trimesh,
    heart: trimesh.Trimesh,
    frame: ViewFrame,
    side: str | None,
) -> tuple[np.ndarray, str]:
    """A vertex ON the node's surface for its label, from the node's `expect_side` in anatomy.yaml.

    Rule: the vertex maximising dot(v - heart_centroid, side_dir), where side_dir is the unit vector
    of `expect_side` (anterior +Z, posterior -Z, left +X, right -X). Among near-ties (within
    ANCHOR_TIE_FRACTION of the node's extent along side_dir) prefer vertices that face the default
    camera and are not occluded by the heart; then the highest score. Nodes without `expect_side`
    use the direction from the heart centroid to their own centroid (anterior if degenerate).
    Real vertex; argmax picks the first hit and subsampling is a fixed stride: deterministic.
    Returns (anchor, how): "side" (a visible near-tie), "side-hidden" (no visible near-tie: the
    pure maximiser, which the heart hides in the default view) or "outward" (no expect_side).
    """
    verts = np.asarray(vessel.vertices)
    hc = surface_centroid(heart)
    if side is not None:
        d, how = side_direction(side), "side"
    else:
        d = surface_centroid(vessel) - hc
        n = float(np.linalg.norm(d))
        d, how = (d / n if n > 1e-6 else side_direction("anterior")), "outward"
    score = (verts - hc) @ d
    tol = ANCHOR_TIE_FRACTION * float(score.max() - score.min())
    ties = np.flatnonzero(score >= score.max() - tol)
    # Fresh mesh: reading vertex_normals would cache them on `vessel` and bloat the exported GLB.
    normals = np.asarray(
        trimesh.Trimesh(verts, vessel.faces, process=False).vertex_normals
    )
    ties = ties[normals[ties] @ DEFAULT_VIEW_DIR > ANCHOR_MIN_FACING]
    ties = ties[:: max(1, len(ties) // ANCHOR_MAX_CANDIDATES)]
    if len(ties):
        eye = frame.eye(1.0)
        visible = ties[occluder_count(verts[ties], eye, heart.triangles) == 0]
        if len(visible):
            return verts[visible[int(np.argmax(score[visible]))]], how
    return verts[int(np.argmax(score))], (how + "-hidden" if side is not None else how)


def hidden_label_x(
    anchor_x: float, heart_x: tuple[float, float], viewport_w: float
) -> float:
    """Screen x of a hidden label's centre: just outside the heart's projected bbox on the
    anchor's side, SILHOUETTE_GAP_PX clear of it, kept inside the viewport (mirrors Labels.tsx)."""
    lo, hi = heart_x
    right = anchor_x >= (lo + hi) / 2
    x = (
        hi + SILHOUETTE_GAP_PX + LABEL_W_PX / 2
        if right
        else lo - SILHOUETTE_GAP_PX - LABEL_W_PX / 2
    )
    return float(np.clip(x, LABEL_W_PX / 2 + 4, viewport_w - LABEL_W_PX / 2 - 4))


def _sample(mesh: trimesh.Trimesh) -> np.ndarray:
    return np.asarray(mesh.vertices)[:: max(1, len(mesh.vertices) // REPORT_SAMPLES)]


def view_report(
    anchors: dict[str, np.ndarray],
    hidden_flag: dict[str, bool],
    owners: dict[str, trimesh.Trimesh],
    heart: trimesh.Trimesh,
    views: dict[str, ViewFrame],
) -> list[str]:
    """Where each target label lands per view, which vessel is under it, and label overlaps.

    `views` maps a view name ("default" or a target node) to its frame. The default view is
    reported at both aspects; each selected view at the narrow one. A flagged anchor that is
    occluded in that view is moved to the heart's silhouette (as Labels.tsx does at runtime).
    """
    lines: list[str] = []
    corners = np.array(
        [
            [x, y, z]
            for x in heart.bounds[:, 0]
            for y in heart.bounds[:, 1]
            for z in heart.bounds[:, 2]
        ]
    )
    for view_name, frame in views.items():
        for aspect in REPORT_ASPECTS if view_name == "default" else REPORT_ASPECTS[:1]:
            w, h = REPORT_HEIGHT_PX * aspect, REPORT_HEIGHT_PX
            eye = frame.eye(aspect)
            heart_px, _ = frame.project(corners, aspect)
            heart_x = (float(heart_px[:, 0].min()), float(heart_px[:, 0].max()))
            label = (
                "default anterior view"
                if view_name == "default"
                else f"{view_name} selected"
            )
            lines.append(f"  [{label}] viewport {w:.0f}x{h}px (aspect {aspect}):")
            visible: dict[str, np.ndarray] = {}
            for other, mesh in owners.items():
                pts = _sample(mesh)
                visible[other] = pts[occluder_count(pts, eye, heart.triangles) == 0]
            boxes: dict[str, tuple[float, float]] = {}
            for name, a in anchors.items():
                a_px, _ = frame.project(a, aspect)
                x, y = float(a_px[0, 0]), float(a_px[0, 1])
                occluded = int(occluder_count(a[None, :], eye, heart.triangles)[0]) > 0
                # Any label whose anchor is behind the heart is moved (not only flagged ones).
                moved = occluded
                if moved:
                    x = hidden_label_x(x, heart_x, w)
                boxes[name] = (x, y)
                # Which vessel is nearest the camera under the label (visible vertices only)?
                best: tuple[float, str] | None = None
                for other, pts in visible.items():
                    if not len(pts):
                        continue
                    p_px, depth = frame.project(pts, aspect)
                    near = np.flatnonzero(
                        np.linalg.norm(p_px - np.array([x, y]), axis=1)
                        <= REPORT_LABEL_PX
                    )
                    if len(near) and (
                        best is None or float(depth[near].min()) < best[0]
                    ):
                        best = (float(depth[near].min()), other)
                off = not (0 <= x <= w and 0 <= y <= h)
                if moved:
                    over_heart = (
                        heart_x[0] - SILHOUETTE_GAP_PX
                        < x
                        < heart_x[1] + SILHOUETTE_GAP_PX
                    )
                    note = "moved outside the silhouette"
                    verdict = (
                        "clamped to viewport, still over the heart (zoomed in)"
                        if over_heart
                        else "clear of heart"
                    )
                elif off:
                    note = "at anchor"
                    verdict = "OFF-SCREEN (vessel is outside this framing)"
                else:
                    note = "at anchor" + (
                        " (hidden vessel now visible)" if hidden_flag[name] else ""
                    )
                    verdict = f"vessel under label: {best[1] if best else '-'}"
                    if best is None or best[1] != name:
                        verdict += "  <-- NOT its own vessel"
                lines.append(
                    f"    {name:5} label at ({x:6.0f},{y:5.0f})px  {note:38} {verdict}"
                )
            names = list(boxes)
            for i, p in enumerate(names):
                for q in names[i + 1 :]:
                    (x1, y1), (x2, y2) = boxes[p], boxes[q]
                    if abs(x1 - x2) < LABEL_W_PX and abs(y1 - y2) < LABEL_H_PX:
                        lines.append(
                            f"    !! {p} and {q} label boxes overlap before nudging"
                        )
    return lines
