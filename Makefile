WEB_PORT ?= 5180
API_PORT ?= 8010
export WEB_PORT API_PORT

.PHONY: setup dev dev-lan dev-api dev-web dev-web-lan prepare train stability benchmark assets types lint fmt test check docker screenshots e2e perf report

setup:
	cd backend && uv sync --extra assets
	cd frontend && npm install

dev:
	$(MAKE) -j2 dev-api dev-web

# Same as dev, but Vite listens on all interfaces so a phone on the LAN can open it.
dev-lan:
	$(MAKE) -j2 dev-api dev-web-lan

dev-api:
	cd backend && uv run uvicorn app.main:app --reload --port $(API_PORT)

dev-web:
	cd frontend && npm run dev

dev-web-lan:
	cd frontend && npm run dev -- --host 0.0.0.0

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

# Playwright end-to-end checks (console clean, scene, stories). Expects `make dev` running.
e2e:
	cd frontend && npx playwright test --project=default

# No-GPU fps tests; run only when the 3D scene changes. Expects `make dev` running.
perf:
	cd frontend && npx playwright test --project=no-gpu

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
