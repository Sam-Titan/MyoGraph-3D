WEB_PORT ?= 5180
API_PORT ?= 8010
export WEB_PORT API_PORT

.PHONY: setup dev dev-api dev-web prepare train stability benchmark assets types lint fmt test check docker screenshots e2e report

setup:
	cd backend && uv sync --extra assets
	cd frontend && npm install

dev:
	$(MAKE) -j2 dev-api dev-web

dev-api:
	cd backend && uv run uvicorn app.main:app --reload --port $(API_PORT)

dev-web:
	cd frontend && npm run dev

prepare:
	cd backend && uv run python -m ml.prepare

train: prepare
	cd backend && uv run python -m ml.train

stability:
	cd backend && uv run python -m ml.stability

# Same-protocol model comparison and feature-group ablation -> backend/artifacts/benchmark.json.
benchmark:
	cd backend && PYTHONPATH=. uv run python ../scripts/benchmark.py

assets:
	cd backend && uv run python ../scripts/build_heart_glb.py

types:
	cd backend && uv run python -m app.export_openapi > ../frontend/openapi.json
	cd frontend && npx openapi-typescript openapi.json -o src/api/schema.d.ts

report:
	python3 scripts/report_numbers.py && node scripts/report_pdf.mjs

screenshots:
	cd frontend && node ../scripts/screenshots.mjs

# Playwright end-to-end checks (console clean, scene screenshots, no-GPU fps). Expects `make dev` running.
e2e:
	cd frontend && npx playwright test

lint:
	cd backend && uv run ruff check . && uv run ruff format --check .
	cd frontend && npm run lint

fmt:
	cd backend && uv run ruff check --fix . && uv run ruff format .
	cd frontend && npm run fmt

test:
	cd backend && uv run pytest
	cd frontend && npm test

check: lint test
	cd frontend && npm run typecheck

docker:
	docker compose up --build
