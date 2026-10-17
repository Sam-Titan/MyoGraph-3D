from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.config import groq_settings, model_version
from app.schemas import (
    FeaturesResponse,
    HealthResponse,
    IntervalsResponse,
    MetricsResponse,
    PredictRequest,
    PredictResponse,
    Preset,
    SummaryRequest,
    SummaryResponse,
)
from app.services.predictor import Predictor, RangesLoading
from app.services.summary import build_facts, summarise
from app.services.validation import validate_values
from ml.display import DisplayConfig, load_display
from ml.stories import Stories

router = APIRouter(prefix="/api")

RETRY_AFTER_SECONDS = "5"


def _ranges_loading() -> HTTPException:
    return HTTPException(
        status_code=503,
        detail="uncertainty ranges are still loading",
        headers={"Retry-After": RETRY_AFTER_SECONDS},
    )


def get_predictor(request: Request) -> Predictor:
    predictor: Predictor | None = getattr(request.app.state, "predictor", None)
    if predictor is None:
        raise HTTPException(status_code=503, detail="model artifacts are not loaded")
    return predictor


Pred = Annotated[Predictor, Depends(get_predictor)]


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", model_version=model_version())


@router.get("/features", response_model=FeaturesResponse)
def features(predictor: Pred) -> FeaturesResponse:
    return predictor.features


@router.get("/presets", response_model=list[Preset])
def presets(predictor: Pred) -> list[Preset]:
    return predictor.presets


@router.get("/stories", response_model=Stories)
def stories(predictor: Pred) -> Stories:
    return predictor.stories


@router.get("/display", response_model=DisplayConfig)
def display() -> DisplayConfig:
    return load_display()


@router.post("/predict", response_model=PredictResponse)
def predict(body: PredictRequest, predictor: Pred) -> PredictResponse:
    errors = validate_values(body.values, predictor.schema)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    return predictor.predict(body.values)


@router.post("/intervals", response_model=IntervalsResponse)
def intervals(body: PredictRequest, predictor: Pred) -> IntervalsResponse:
    errors = validate_values(body.values, predictor.schema)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    try:
        return predictor.intervals(body.values)
    except RangesLoading:
        raise _ranges_loading() from None


@router.post("/summary", response_model=SummaryResponse)
def summary(body: SummaryRequest, predictor: Pred) -> SummaryResponse:
    """Re-runs predict server-side (client numbers are never trusted), then words it."""
    errors = validate_values(body.values, predictor.schema)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    targets = predictor.features.targets
    if body.selected_target is not None and body.selected_target not in {t.id for t in targets}:
        raise HTTPException(status_code=422, detail="unknown selected_target")
    try:
        ranges = predictor.intervals(body.values)
    except RangesLoading:
        raise _ranges_loading() from None  # the summary states ranges, so it waits for them
    facts = build_facts(
        predictor.predict(body.values),
        ranges,
        targets,
        body.selected_target,
        n_patients=predictor.metrics.split.n_train + predictor.metrics.split.n_test,
    )
    labels = frozenset(f.label for f in predictor.features.features)
    return summarise(facts, groq_settings(), labels)


@router.get("/metrics", response_model=MetricsResponse)
def metrics(predictor: Pred) -> MetricsResponse:
    return predictor.metrics
