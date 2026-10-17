"""Mesh operations for build_heart_glb.py: vessel inflation and supply-region (territory) weights.

Pure and deterministic: no randomness except a fixed-seed surface sampler.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import trimesh
from scipy import sparse
from scipy.spatial import cKDTree

NORMAL_SMOOTHING_ITERS = 4
DISPLACEMENT_SMOOTHING_ITERS = 2
SAMPLE_SPACING_MM = 0.5  # surface sample spacing for the nearest-artery distance
SAMPLE_SEED = 42
FADE_START = 0.7  # the weight fades to exactly 0 between FADE_START * max_mm and max_mm


@dataclass(frozen=True)
class InflateReport:
    requested_mm: float
    mean_applied_mm: float
    max_applied_mm: float
    capped_share: float  # share of vertices whose displacement was cut by the edge-length cap

    @property
    def kept(self) -> float:
        """Mean applied displacement as a share of the request (1.0 = cap never bit)."""
        return self.mean_applied_mm / self.requested_mm if self.requested_mm else 1.0


def _adjacency(mesh: trimesh.Trimesh) -> sparse.csr_matrix:
    e = mesh.edges_unique
    n = len(mesh.vertices)
    ones = np.ones(len(e))
    a = sparse.coo_matrix((ones, (e[:, 0], e[:, 1])), shape=(n, n))
    return (a + a.T).tocsr()


def _average(adj: sparse.csr_matrix, values: np.ndarray) -> np.ndarray:
    deg = np.asarray(adj.sum(axis=1)).ravel()
    deg[deg == 0] = 1.0
    return adj @ values / (deg[:, None] if values.ndim > 1 else deg)


def smoothed_vertex_normals(mesh: trimesh.Trimesh, adj: sparse.csr_matrix) -> np.ndarray:
    """Unit vertex normals, Laplacian-smoothed so neighbouring vertices move together."""
    normals = np.asarray(mesh.vertex_normals, dtype=float)
    for _ in range(NORMAL_SMOOTHING_ITERS):
        normals = normals + _average(adj, normals)
        normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
    return normals


def inflate(
    mesh: trimesh.Trimesh, mm: float, edge_ratio: float
) -> tuple[trimesh.Trimesh, InflateReport]:
    """Thicken `mesh` by `mm` along smoothed normals (mesh units are millimetres).

    Duplicate vertices are merged first, otherwise a seam vertex that exists twice would move in
    two directions and open a crack. Each vertex moves at most `edge_ratio` x its mean incident
    edge length, which keeps the offset surface from folding through itself.
    """
    out = mesh.copy()
    out.merge_vertices()
    out.remove_unreferenced_vertices()
    adj = _adjacency(out)
    edge_len = np.zeros(len(out.vertices))
    lengths = out.edges_unique_length
    for col in (0, 1):
        np.add.at(edge_len, out.edges_unique[:, col], lengths)
    deg = np.maximum(np.asarray(adj.sum(axis=1)).ravel(), 1.0)
    cap = edge_ratio * edge_len / deg
    applied = np.minimum(mm, cap)
    for _ in range(DISPLACEMENT_SMOOTHING_ITERS):  # no spikes where the cap changes abruptly
        applied = np.minimum(0.5 * (applied + _average(adj, applied)), cap)
    out.vertices = out.vertices + smoothed_vertex_normals(out, adj) * applied[:, None]
    report = InflateReport(
        requested_mm=mm,
        mean_applied_mm=float(applied.mean()),
        max_applied_mm=float(applied.max()),
        capped_share=float((cap < mm).mean()),
    )
    return out, report


def territory_weights(
    heart_vertices: np.ndarray,
    vessels: list[trimesh.Trimesh],
    units_per_mm: float,
    falloff_mm: float,
    max_mm: float,
) -> np.ndarray:
    """(n_vertices, n_vessels) float32 in [0, 1]: closeness of each heart vertex to each vessel.

    Channels are independent (not normalised across vessels). Distance is to the nearest point on
    the vessel surface (its vertices plus fixed-seed surface samples), in millimetres.
    """
    out = np.zeros((len(heart_vertices), len(vessels)), dtype=np.float32)
    for k, vessel in enumerate(vessels):
        count = int(vessel.area / (SAMPLE_SPACING_MM * units_per_mm) ** 2)
        points = vessel.vertices
        if count:
            samples, _ = trimesh.sample.sample_surface(vessel, count, seed=SAMPLE_SEED)
            points = np.vstack([points, samples])
        dist_mm, _ = cKDTree(points).query(heart_vertices)
        dist_mm = dist_mm / units_per_mm
        weight = np.exp(-((dist_mm / falloff_mm) ** 2))
        t = np.clip((dist_mm / max_mm - FADE_START) / (1 - FADE_START), 0.0, 1.0)
        weight *= 1.0 - t * t * (3 - 2 * t)  # smoothstep fade to exactly 0 at max_mm
        out[:, k] = np.where(dist_mm >= max_mm, 0.0, weight)
    return out
