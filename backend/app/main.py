import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.access_log import AccessLogMiddleware
from app.services.predictor import Predictor

logging.basicConfig(level=logging.INFO)

# Dev origins of the Vite server (see WEB_PORT in the Makefile). Docker is same-origin behind nginx.
WEB_PORT = os.environ.get("WEB_PORT", "5180")
DEV_ORIGINS = [f"http://{host}:{WEB_PORT}" for host in ("localhost", "127.0.0.1")]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.predictor = Predictor()
    yield


app = FastAPI(title="MyoGraph 3D API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=DEV_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
# Added last = outermost, so CORS preflights and unhandled exceptions are logged too.
app.add_middleware(AccessLogMiddleware)
app.include_router(router)
