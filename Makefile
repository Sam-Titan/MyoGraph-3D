.PHONY: setup dev dev-api dev-web prepare train assets types lint fmt test check docker

setup:
	cd backend && uv sync --extra assets
	cd frontend && npm install

dev:
	$(MAKE) -j2 dev-api dev-web

dev-api:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

dev-web:
	cd frontend && npm run dev

prepare:
	cd backend && uv run python -m ml.prepare

train:
	@echo "make train: not implemented yet (phase 2)" && exit 1

assets:
	@echo "make assets: not implemented yet (phase 5)" && exit 1

types:
	cd backend && uv run python -m app.export_openapi > ../frontend/openapi.json
	cd frontend && npx openapi-typescript openapi.json -o src/api/schema.d.ts

lint:
	cd backend && uv run ruff check . && uv run ruff format --check .
	cd frontend && npm run lint

fmt:
	cd backend && uv run ruff check --fix . && uv run ruff format .
	cd frontend && npm run fmt

test:
	cd backend && uv run pytest

check: lint test
	cd frontend && npm run typecheck

docker:
	@echo "make docker: not implemented yet (phase 7)" && exit 1
