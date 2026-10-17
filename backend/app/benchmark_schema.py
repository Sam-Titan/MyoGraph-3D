"""/api/benchmark: the precomputed benchmark.json (Phase 17.5). The API only serves it."""

from typing import Literal

from pydantic import BaseModel


class MeanStd(BaseModel):
    mean: float
    std: float


class MetricValues(BaseModel):
    roc_auc: float
    brier: float
    recall: float


class CvValues(BaseModel):
    roc_auc: MeanStd
    brier: MeanStd
    recall: MeanStd


class PairedTest(BaseModel):
    """Per-fold difference (this minus the reference) with the Nadeau-Bengio corrected CI."""

    mean_diff: float
    std_diff: float
    ci_lo: float
    ci_hi: float
    p: float
    within_noise: bool  # the corrected CI contains 0


class PairedMetrics(BaseModel):
    roc_auc: PairedTest
    brier: PairedTest
    recall: PairedTest


class BenchCell(BaseModel):
    cv: CvValues
    holdout: MetricValues  # reported only; never used to pick or rank
    vs_reference: PairedMetrics


class BenchProtocol(BaseModel):
    seed: int
    cv: str
    n_folds: int
    n_train: int
    n_test: int
    calibration: str
    threshold: str
    paired_test: str
    confidence_level: float


class BenchModelInfo(BaseModel):
    id: str
    label: str
    status: Literal["ok", "skipped"]
    note: str


class BenchFeatureSet(BaseModel):
    id: str
    label: str
    drop_groups: list[str]
    dropped_columns: list[str]
    n_columns: int


class BenchmarkResponse(BaseModel):
    protocol: BenchProtocol
    reference_model: str
    models: list[BenchModelInfo]
    feature_sets: list[BenchFeatureSet]
    comparison: dict[str, dict[str, BenchCell]]  # target -> model id -> cell
    ablation: dict[str, dict[str, BenchCell]]  # target -> feature set id -> cell
