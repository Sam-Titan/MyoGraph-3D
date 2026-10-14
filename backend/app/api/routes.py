from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.config import groq_settings, model_version
from app.schemas import (
    FeaturesResponse,
    HealthResponse,
    MetricsResponse,
    PredictRequest,
    PredictResponse,
    Preset,
    SummaryRequest,
    SummaryResponse,
)
from app.services.predictor import Predictor
from app.services.summary import build_facts, summarise
from app.services.validation import validate_values

router = APIRouter(prefix="/api")


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


@router.post("/predict", response_model=PredictResponse)
def predict(body: PredictRequest, predictor: Pred) -> PredictResponse:
    errors = validate_values(body.values, predictor.schema)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    return predictor.predict(body.values)


@router.post("/summary", response_model=SummaryResponse)
def summary(body: SummaryRequest, predictor: Pred) -> SummaryResponse:
    """Re-runs predict server-side (client numbers are never trusted), then words it."""
    errors = validate_values(body.values, predictor.schema)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    targets = predictor.features.targets
    if body.selected_target is not None and body.selected_target not in {t.id for t in targets}:
        raise HTTPException(status_code=422, detail="unknown selected_target")
    facts = build_facts(predictor.predict(body.values), targets, body.selected_target)
    labels = frozenset(f.label for f in predictor.features.features)
    return summarise(facts, groq_settings(), labels)


@router.get("/metrics", response_model=MetricsResponse)
def metrics(predictor: Pred) -> MetricsResponse:
    return predictor.metrics
