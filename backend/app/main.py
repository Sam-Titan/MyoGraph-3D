import logging

from fastapi import FastAPI

from app.api.routes import router

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="CardioLens 3D API")
app.include_router(router)
