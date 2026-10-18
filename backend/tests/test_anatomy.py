import sys
from pathlib import Path

import numpy as np
import pytest
import yaml
from pydantic import ValidationError

from app.services.predictor import ANATOMY_PATH
from ml.anatomy import Anatomy, load_anatomy
from ml.schema import load_schema

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from inspect_glb import node_summaries  # noqa: E402

SCHEMA = load_schema()
ANATOMY = load_anatomy()
NODES = ANATOMY.nodes


@pytest.fixture(scope="module", params=["desktop", "mobile"])
def glb(request: pytest.FixtureRequest) -> tuple[str, Path, dict[str, dict]]:
    path = ROOT / (ANATOMY.output if request.param == "desktop" else ANATOMY.output_mobile)
    return request.param, path, node_summaries(path)


@pytest.mark.parametrize("target", list(SCHEMA.targets))
def test_target_has_exactly_one_node(target: str) -> None:
    assert sum(1 for n in NODES if n.target == target) == 1


def test_no_node_targets_unknown_target() -> None:
    assert {n.target for n in NODES if n.target} <= set(SCHEMA.targets)


def test_vessel_targets_are_territory_channels() -> None:
    vessels = {t for t, spec in SCHEMA.targets.items() if spec.role == "vessel"}
    channels = {n.target for n in ANATOMY.territory_nodes()}
    assert channels == vessels
    assert {n.target for n in NODES if n.role == "vessel"} == vessels
    assert all(n.where for n in NODES if n.role == "vessel")


def test_overall_target_is_the_muscle_node() -> None:
    overall = {t for t, spec in SCHEMA.targets.items() if spec.role == "overall"}
    assert {ANATOMY.muscle().target} == overall


def test_vessels_are_inflated_and_mobile_budgets_are_lower() -> None:
    assert all(n.inflate > 0 for n in NODES if n.role == "vessel")
    assert all(n.max_triangles_mobile <= n.max_triangles for n in NODES)


def test_schema_rejects_bad_config() -> None:
    raw = yaml.safe_load(ANATOMY_PATH.read_text())
    raw["territory"]["max_mm"] = raw["territory"]["falloff_mm"]
    with pytest.raises(ValidationError):
        Anatomy.model_validate(raw)
    raw = yaml.safe_load(ANATOMY_PATH.read_text())
    raw["nodes"][0]["unknown_key"] = 1
    with pytest.raises(ValidationError):
        Anatomy.model_validate(raw)


def test_glb_contains_every_node(glb: tuple[str, Path, dict[str, dict]]) -> None:
    _, _, nodes = glb
    required = {n.name for n in NODES if not n.optional}
    assert required <= set(nodes)
    assert set(nodes) <= {n.name for n in NODES}
    assert {n.name for n in NODES if n.target} <= set(nodes)


def test_glb_territory_mapping_matches_config(glb: tuple[str, Path, dict[str, dict]]) -> None:
    _, _, nodes = glb
    heart = nodes[ANATOMY.muscle().name]
    channels = [n.name for n in ANATOMY.territory_nodes()]
    assert heart["extras"]["territoryChannels"] == channels
    t = heart["territory"]
    assert t is not None and t.shape == (heart["vertices"], len(channels))
    assert t.min() >= 0.0 and t.max() <= 1.0
    assert np.all(t.max(axis=0) > 0.9)  # every channel reaches the vessel itself
    assert np.all((t > 0).mean(axis=0) < 1.0)  # and is exactly 0 beyond max_mm somewhere
    assert all(n["territory"] is None for k, n in nodes.items() if k != ANATOMY.muscle().name)


def test_glb_supply_regions_are_balanced(glb: tuple[str, Path, dict[str, dict]]) -> None:
    """No channel's strong region (weight > 0.5) is under half the size of the largest one."""
    _, _, nodes = glb
    t = nodes[ANATOMY.muscle().name]["territory"]
    share = (t > 0.5).mean(axis=0)
    assert share.min() >= 0.5 * share.max(), share


def test_territory_override_must_stay_ordered() -> None:
    raw = yaml.safe_load(ANATOMY_PATH.read_text())
    node = next(n for n in raw["nodes"] if n.get("territory"))
    node["territory_falloff_mm"] = 50
    node["territory_max_mm"] = 40
    with pytest.raises(ValueError):
        Anatomy.model_validate(raw).territory_scale(
            next(n for n in Anatomy.model_validate(raw).nodes if n.name == node["name"])
        )


def test_glb_keeps_the_heart_colour_free(glb: tuple[str, Path, dict[str, dict]]) -> None:
    """Territory rides on a custom attribute, so the heart's material and colour are unaffected."""
    _, _, nodes = glb
    assert "COLOR_0" not in nodes[ANATOMY.muscle().name]["attributes"]
    assert "_TERRITORY" in nodes[ANATOMY.muscle().name]["attributes"]


def test_glb_budgets(glb: tuple[str, Path, dict[str, dict]]) -> None:
    kind, path, nodes = glb
    budget = ANATOMY.budget_desktop if kind == "desktop" else ANATOMY.budget_mobile
    assert sum(n["triangles"] for n in nodes.values()) < budget.max_triangles
    assert path.stat().st_size <= budget.max_bytes
    for n in NODES:
        if n.name in nodes:
            limit = n.max_triangles if kind == "desktop" else n.max_triangles_mobile
            assert nodes[n.name]["triangles"] <= limit


def test_mobile_is_lighter_with_same_nodes_and_extras() -> None:
    desktop = node_summaries(ROOT / ANATOMY.output)
    mobile = node_summaries(ROOT / ANATOMY.output_mobile)
    assert desktop.keys() == mobile.keys()
    assert sum(n["triangles"] for n in mobile.values()) < sum(
        n["triangles"] for n in desktop.values()
    )
    for name in desktop:
        d, m = desktop[name]["extras"], mobile[name]["extras"]
        assert d.keys() == m.keys()
        # The label anchor is a vertex of that LOD's own mesh, so it may differ.
        assert {k: v for k, v in d.items() if k != "anchor"} == {
            k: v for k, v in m.items() if k != "anchor"
        }
