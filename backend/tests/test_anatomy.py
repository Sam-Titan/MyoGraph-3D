import pytest
import yaml

from app.services.predictor import ANATOMY_PATH
from ml.schema import load_schema

SCHEMA = load_schema()
NODES = yaml.safe_load(ANATOMY_PATH.read_text())["nodes"]


@pytest.mark.parametrize("target", list(SCHEMA.targets))
def test_target_has_exactly_one_node(target: str) -> None:
    assert sum(1 for n in NODES if n.get("target") == target) == 1


def test_no_node_targets_unknown_target() -> None:
    assert {n["target"] for n in NODES if n.get("target")} <= set(SCHEMA.targets)
