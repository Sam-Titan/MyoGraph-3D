"""Typed, validated view of `config/anatomy.yaml` (links model targets to 3D geometry)."""

from functools import cache
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.config import CONFIG_DIR

ANATOMY_PATH = CONFIG_DIR / "anatomy.yaml"

Side = Literal["anterior", "posterior", "left", "right"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Node(_Strict):
    name: str
    target: str | None = None
    # A nested list means "first available alternative", not "merge all".
    fma: list[str | list[str]]
    role: Literal["vessel", "muscle", "context"] = "context"
    expect_side: Side | None = None
    view_dir: list[float] | None = Field(default=None, min_length=3, max_length=3)
    max_triangles: int = Field(gt=0)
    max_triangles_mobile: int = Field(gt=0)
    inflate: float = Field(default=0.0, ge=0)  # source millimetres, along smoothed vertex normals
    territory: bool = False  # the heart carries a supply-region weight channel for this node
    where: str | None = None  # plain-language location, shown in the vessel key
    optional: bool = False
    default_visible: bool = True

    @model_validator(mode="after")
    def _consistent(self) -> Node:
        if self.max_triangles_mobile > self.max_triangles:
            raise ValueError(f"{self.name}: max_triangles_mobile exceeds max_triangles")
        if self.territory and self.role != "vessel":
            raise ValueError(f"{self.name}: territory needs role: vessel")
        if self.role == "vessel" and (not self.target or not self.territory or not self.where):
            raise ValueError(f"{self.name}: role vessel needs target, territory: true and where")
        return self


class Territory(_Strict):
    falloff_mm: float = Field(gt=0)  # Gaussian scale of the weight with distance to the artery
    max_mm: float = Field(gt=0)  # weight is exactly 0 beyond this distance

    @model_validator(mode="after")
    def _ordered(self) -> Territory:
        if self.max_mm <= self.falloff_mm:
            raise ValueError("territory.max_mm must exceed falloff_mm")
        return self


class Budget(_Strict):
    max_triangles: int = Field(gt=0)
    max_bytes: int = Field(gt=0)


class Fallback(_Strict):
    tube_radius: float


class Anatomy(_Strict):
    output: str
    output_mobile: str
    units: str
    territory: Territory
    budget_desktop: Budget
    budget_mobile: Budget
    # A vertex moves at most this multiple of its mean incident edge length (no self-intersection).
    inflate_edge_ratio: float = Field(gt=0)
    nodes: list[Node]
    fallback: Fallback

    @model_validator(mode="after")
    def _unique(self) -> Anatomy:
        names = [n.name for n in self.nodes]
        if len(set(names)) != len(names):
            raise ValueError("duplicate node names")
        targets = [n.target for n in self.nodes if n.target]
        if len(set(targets)) != len(targets):
            raise ValueError("a target maps to more than one node")
        if sum(1 for n in self.nodes if n.role == "muscle") != 1:
            raise ValueError("exactly one node must have role: muscle")
        return self

    def territory_nodes(self) -> list[Node]:
        """Nodes with a supply-region channel, in config order (= channel order in the GLB)."""
        return [n for n in self.nodes if n.territory]

    def muscle(self) -> Node:
        return next(n for n in self.nodes if n.role == "muscle")


@cache
def load_anatomy(path: Path = ANATOMY_PATH) -> Anatomy:
    return Anatomy.model_validate(yaml.safe_load(path.read_text()))
