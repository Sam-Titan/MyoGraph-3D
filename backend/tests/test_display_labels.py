"""Phone headline labels: one plain-words entry per target, no stray keys."""

from ml.display import load_display
from ml.schema import load_schema


def test_compact_labels_cover_exactly_the_targets() -> None:
    assert set(load_display().compact_labels) == set(load_schema().targets)
