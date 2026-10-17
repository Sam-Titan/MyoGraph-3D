"""Benchmark: config rules, group-derived column dropping, statistics, schema, determinism."""

import json
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.benchmark_schema import BenchmarkResponse
from app.core.config import ARTIFACTS_DIR
from app.main import app
from ml import benchmark as B
from ml.benchmark_config import (
    BenchmarkConfig,
    dropped_columns,
    kept_columns,
    load_benchmark,
)
from ml.schema import load_schema

SCHEMA = load_schema()
CFG = load_benchmark()


def test_config_groups_exist_and_first_set_is_baseline() -> None:
    CFG.check_groups(SCHEMA)
    assert CFG.feature_sets[0].drop_groups == []


def test_config_rejects_unknown_group_and_bad_reference() -> None:
    raw = CFG.model_dump()
    raw["feature_sets"][1]["drop_groups"] = ["nope"]
    with pytest.raises(ValueError, match="unknown groups"):
        BenchmarkConfig(**raw).check_groups(SCHEMA)
    raw = CFG.model_dump()
    raw["reference_model"] = "ghost"
    with pytest.raises(ValueError, match="reference_model"):
        BenchmarkConfig(**raw)


def test_dropped_columns_per_feature_set() -> None:
    """Every model column derived from a dropped group goes, one-hot dummies included."""
    ecg = {"q_wave", "st_elevation", "st_depression", "t_inversion", "lvh", "poor_r_progression"}
    got = {s.id: dropped_columns(SCHEMA, s.drop_groups) for s in CFG.feature_sets}
    assert got["all"] == []
    assert set(got["no_ecg"]) == ecg | {"bbb_lbbb", "bbb_rbbb"}
    assert set(got["no_echo"]) == {"ef_tte", "region_rwma", "vhd"}
    assert set(got["no_ecg_echo"]) == set(got["no_ecg"]) | set(got["no_echo"])
    for s in CFG.feature_sets:
        kept = kept_columns(SCHEMA, s.drop_groups)
        assert not set(kept) & set(got[s.id])
        assert len(kept) + len(got[s.id]) == len(SCHEMA.model_columns)


def test_no_target_leaks_into_any_model_input() -> None:
    forbidden = set(SCHEMA.excluded_from_inputs) | set(SCHEMA.targets)
    for s in CFG.feature_sets:
        assert not forbidden & set(kept_columns(SCHEMA, s.drop_groups))
    tasks = B.plan_tasks(CFG, SCHEMA, skip=set())
    assert tasks
    for t in tasks:
        assert not forbidden & set(t.columns)


def test_corrected_test_is_wider_than_plain_and_flags_noise() -> None:
    rng = np.random.default_rng(0)
    noise = rng.normal(0.0, 0.03, 15)
    r = B.corrected_paired_test(noise, n_fit=194, n_val=48, level=0.95)
    plain_half = 2.145 * noise.std(ddof=1) / np.sqrt(15)
    assert (r["ci_hi"] - r["ci_lo"]) / 2 > plain_half  # the correction widens it
    assert r["within_noise"] == (r["ci_lo"] <= 0 <= r["ci_hi"])
    big = B.corrected_paired_test(np.full(15, 0.1) + noise * 0.1, n_fit=194, n_val=48, level=0.95)
    assert not big["within_noise"]
    assert big["p"] < 0.05


def test_run_cv_is_deterministic_and_leak_free() -> None:
    d = B._data()
    cols = kept_columns(SCHEMA, ["ecg", "echo"])
    args = (
        d["X_tr"][cols],
        d["Y_tr"]["CAD"].to_numpy(),
        d["X_te"][cols],
        d["Y_te"]["CAD"].to_numpy(),
    )
    one, two = (B.run_cv(B.FACTORIES["logreg"], *args) for _ in range(2))
    assert one == two
    assert len(one["folds"]["roc_auc"]) == B.N_SPLITS * B.N_REPEATS


def test_benchmark_json_matches_schema_and_config() -> None:
    raw: dict[str, Any] = json.loads((ARTIFACTS_DIR / "benchmark.json").read_text())
    data = BenchmarkResponse(**raw)
    assert data.reference_model == CFG.reference_model
    assert [s.id for s in data.feature_sets] == [s.id for s in CFG.feature_sets]
    for t in SCHEMA.targets:
        ran = {m.id for m in data.models if m.status == "ok"}
        assert set(data.comparison[t]) == ran
        assert set(data.ablation[t]) == {s.id for s in CFG.feature_sets}
    assert "timestamp" not in json.dumps(raw).lower()


def test_endpoint_serves_the_file() -> None:
    with TestClient(app) as c:
        res = c.get("/api/benchmark")
    assert res.status_code == 200
    assert res.json() == json.loads(
        BenchmarkResponse(
            **json.loads((ARTIFACTS_DIR / "benchmark.json").read_text())
        ).model_dump_json()
    )
