import json

from app.core.config import ARTIFACTS_DIR
from ml.preprocess import load_raw, raw_targets
from ml.schema import load_schema
from ml.split import load_split

SCHEMA = load_schema()


def test_presets_are_holdout_patients() -> None:
    presets = json.loads((ARTIFACTS_DIR / "presets.json").read_text())
    df = load_raw(schema=SCHEMA)
    test = df.iloc[load_split().test_idx].reset_index(drop=True)
    truth = raw_targets(test, SCHEMA)
    assert len(presets) == 6 and len({p["id"] for p in presets}) == 6
    for p in presets:
        # truth must match a real hold-out row with the same label vector
        assert any(
            all(bool(truth.loc[i, t]) == p["truth"][t] for t in SCHEMA.targets)
            for i in range(len(truth))
        )
        assert set(p["truth"]) == set(SCHEMA.targets)
    assert "misclassifies" in next(p for p in presets if p["id"] == "hard-case")["description"]
