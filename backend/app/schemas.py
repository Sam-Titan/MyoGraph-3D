"""API contract (Pydantic is the source of truth; TS types are generated from it)."""

from typing import Literal

from pydantic import BaseModel

InputValue = float | int | str
Role = Literal["overall", "vessel"]


class HealthResponse(BaseModel):
    status: str
    model_version: str


# --- /api/features ----------------------------------------------------------------------------
class TargetInfo(BaseModel):
    id: str
    label: str
    role: Role
    node: str


class GroupInfo(BaseModel):
    id: str
    label: str


class InputBoundsInfo(BaseModel):
    min: float
    max: float
    step: float


class OptionInfo(BaseModel):
    value: str
    label: str


class RangeInfo(BaseModel):
    low: float
    high: float


class ObservedInfo(BaseModel):
    min: float
    max: float


class FeatureInfo(BaseModel):
    id: str
    label: str
    group: str
    kind: Literal["number", "binary", "category", "composite", "derived"]
    unit: str | None = None
    input: InputBoundsInfo | None = None
    options: list[OptionInfo] = []
    reference: RangeInfo | None = None
    observed: ObservedInfo | None = None
    default: InputValue | None = None


class FeaturesResponse(BaseModel):
    targets: list[TargetInfo]
    groups: list[GroupInfo]
    features: list[FeatureInfo]


# --- /api/presets -----------------------------------------------------------------------------
class Preset(BaseModel):
    id: str
    label: str
    description: str
    values: dict[str, InputValue]
    truth: dict[str, bool]


# --- /api/predict -----------------------------------------------------------------------------
class PredictRequest(BaseModel):
    values: dict[str, InputValue]


class TargetPrediction(BaseModel):
    probability: float
    positive: bool
    threshold: float


class Contribution(BaseModel):
    id: str
    label: str
    display_value: str
    logit: float


class TargetExplanation(BaseModel):
    base_probability: float
    base_logit: float
    contributions: list[Contribution]


class BreakdownRow(BaseModel):
    id: str
    label: str
    group: str
    kind: Literal["number", "derived", "binary"]
    value: float
    unit: str | None = None
    reference: RangeInfo | None = None
    status: Literal["low", "normal", "high"] | None = None
    outside_training_range: bool
    contribution: dict[str, float]


class PredictResponse(BaseModel):
    model_version: str
    targets: dict[str, TargetPrediction]
    explanations: dict[str, TargetExplanation]
    breakdown: list[BreakdownRow]
    warnings: list[str]


# --- /api/metrics -----------------------------------------------------------------------------
class MetricStat(BaseModel):
    mean: float
    std: float


class Prevalence(BaseModel):
    train: float
    test: float


class CvMetrics(BaseModel):
    default: dict[str, MetricStat]
    tuned: dict[str, MetricStat]


class TestMetrics(BaseModel):
    __test__ = False  # not a pytest class
    default: dict[str, float]
    tuned: dict[str, float]


class ThresholdInfo(BaseModel):
    cv_mean: float
    cv_std: float
    default: float
    tuned: float


class RocCurve(BaseModel):
    fpr: list[float]
    tpr: list[float]


class Confusion(BaseModel):
    tp: int
    fp: int
    tn: int
    fn: int


class ConfusionPair(BaseModel):
    default: Confusion
    tuned: Confusion


class CalibrationBin(BaseModel):
    fraction_positive: float
    mean_predicted: float
    n: int


class TargetMetrics(BaseModel):
    label: str
    role: Role
    prevalence: Prevalence
    cv: CvMetrics
    test: TestMetrics
    threshold: ThresholdInfo
    roc_test: RocCurve
    confusion_test: ConfusionPair
    calibration_bins: list[CalibrationBin]


class ImportanceRow(BaseModel):
    id: str
    label: str
    importance: float


class StabilityStat(BaseModel):
    median: float
    iqr: float
    q25: float
    q75: float
    min: float
    max: float
    official: float
    official_percentile: float
    values: list[float]


class Stability(BaseModel):
    official_seed: int
    seeds: list[int]
    targets: dict[str, dict[str, StabilityStat]]


class CvInfo(BaseModel):
    n_splits: int
    n_repeats: int
    seed: int


class SplitInfo(BaseModel):
    n_train: int
    n_test: int
    test_size: float
    seed: int
    stratify_on: list[str]


class MetricsResponse(BaseModel):
    cv: CvInfo
    split: SplitInfo
    targets: dict[str, TargetMetrics]
    feature_importance: dict[str, list[ImportanceRow]]
    stability: Stability
    excluded_inputs: list[str]


# --- /api/summary -----------------------------------------------------------------------------
class SummaryRequest(PredictRequest):
    """Same values as /predict; `selected_target` defaults to the overall target."""

    selected_target: str | None = None


class SummaryResponse(BaseModel):
    text: str
    source: Literal["groq", "template"]
    model: str | None = None
