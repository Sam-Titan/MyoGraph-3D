"""Dump the OpenAPI schema to stdout (offline, no server needed) for `make types`."""

import json

from app.main import app

if __name__ == "__main__":
    print(json.dumps(app.openapi(), indent=2))
