# CardioLens 3D — Specification

> Working title. Track A, Multimodal AI Hackathon 2026: *Cardiovascular Risk Visualization & Prediction*.
> Solo build, 2-day deadline. This file is the contract; `docs/PLAN.md` is the order of work.

## 1. Goal

A web app where a clinician-style user enters (or loads) a patient's clinical record and sees:

1. Predicted probability of **overall CAD** and of **LAD / LCX / RCA stenosis**.
2. A **3D heart** whose three coronary arteries are coloured by those probabilities, live.
3. **Why**: per-patient SHAP attributions and a physiological breakdown (value vs reference range vs contribution).
4. **How good the model is**: honest validation metrics on a dedicated tab.

Always with a visible disclaimer: *decision support / educational only — not a substitute for diagnostic imaging.*

## 2. Judging criteria → where we score

| Criterion (weight) | What delivers it |
|---|---|
| Predictive performance (30%) | Stratified hold-out + repeated stratified CV, calibrated probabilities, full metric set, ROC + calibration plots, leakage test |
| 3D visualization (25%) | Real BodyParts3D anatomy with separate LAD/LCX/RCA meshes, live colour mapping, hover/select/fly-to, translucency toggle |
| Clinical interpretability (20%) | Per-target SHAP bars, base-rate → patient probability, physiological breakdown with reference ranges |
| System integration (15%) | Schema-driven form → API → models → 3D, live debounced updates, generated TS types |
| Technical implementation (10%) | Config-driven architecture, Ruff/Biome, pytest, Makefile, Docker, committed weights, cited public resources |

## 3. Data

- **Source**: UCI *Extension of Z-Alizadeh Sani* dataset, `data/raw/z_alizadeh_sani_ext.csv` (a lossless one-time export of the UCI `.xlsx`, sheet `Sheet 1 - Table 1`; round-trip verified). 303 rows × 59 columns, **no missing values**. Read it with `pd.read_csv`; no Excel dependency.
- **Targets** (positive class / count): CAD `Cath=CAD` 216/303 (71%), LAD `Stenotic` 177 (58%), LCX 119 (39%), RCA 114 (38%).
- **Label consistency**: every patient with ≥1 stenotic vessel is CAD, except 1 row. 0-vessel = 86 Normal.
- **Schema**: `config/features.yaml` (verified against the file). Key cleaning rules it encodes:
  - `Sex` value `Fmale` is a typo for Female.
  - Binary columns mix `Y/N` and `1/0`.
  - `VHD` has `mild` lowercase → ordinal 0–3.
  - `BBB` → one-hot (`bbb_lbbb`, `bbb_rbbb`).
  - `Exertional CP` is constant → dropped.
  - `BMI` = weight/height² exactly and `Obesity` = BMI>25 → both **derived** server-side, and **recomputed for training too** (overrides the 1 inconsistent Obesity row) so training and serving share one code path.
  - Smoking (2 cols) and chest-pain type (3 cols) are mutually exclusive → exposed as single **composite** inputs.
- **Model matrix**: 55 columns. **API inputs**: 49 fields.
- **Leakage rule**: `Cath, LAD, LCX, RCA` are never inputs for any model — including the *other* vessels when predicting one vessel. Enforced by `tests/test_leakage.py`.

## 4. ML pipeline

### 4.1 Split & validation
- Stratified **80/20 hold-out**, stratified on *number of stenotic vessels (0–3)* so all four targets stay balanced. `random_state=42`. Saved as `artifacts/split.json` (row indices).
- **Development metrics**: `RepeatedStratifiedKFold(n_splits=5, n_repeats=3, random_state=42)` on the 80% train set only.
- **Final report**: CV mean ± std (primary) **and** hold-out test (secondary sanity check; n≈61, so noisy — say so).
- **Presets come only from the hold-out set**, so the demo never shows a patient the model trained on.

### 4.2 Model
- One `XGBClassifier` per target behind a common interface (`ml/models/base.py`):
  ```python
  class RiskModel(Protocol):
      def fit(self, X, y) -> None
      def predict_proba(self, X) -> np.ndarray          # calibrated P(positive)
      def explain(self, X) -> Explanation               # per-column contributions in calibrated log-odds + base value
      def save(self, path) / load(cls, path)
  ```
  Adding TabPFN / LightGBM later = a new file implementing this, plus a registry entry. No other changes.
- Starting hyper-parameters (a quick baseline already gave the numbers in 4.4):
  `n_estimators=300, max_depth=3, learning_rate=0.05, subsample=0.8, colsample_bytree=0.8, min_child_weight=2, reg_lambda=1.0, scale_pos_weight=neg/pos (per target), eval_metric="logloss"`.
- Optional, time-boxed: a 20-iteration randomized search on train CV (ROC-AUC). Persist the chosen params in `artifacts/params.json`.

### 4.3 Calibration and explanations (exact, cheap)
- Get **out-of-fold raw margins** on train (5-fold), fit a 1-D logistic regression `logit_cal = a·margin + b` (Platt scaling). Then refit XGBoost on the full train set.
- Served probability = `sigmoid(a·margin + b)`.
- Per-patient SHAP = XGBoost's native TreeSHAP: `booster.predict(DMatrix, pred_contribs=True)`. This gives exact contributions + bias in margin space. Transform: `contrib_cal = a·contrib`, `base_cal = a·bias + b`.
  - Contributions plus base still sum exactly to the calibrated logit.
  - Use native `pred_contribs`, not the `shap` package, for serving: no version-compatibility risk. The `shap` package is optional, for offline plots only.
- **Display aggregation**: contributions of multi-column inputs (`bbb_*`, smoking, chest-pain) are **summed** back to their input id (exact, by additivity).
- **Global importance**: mean |SHAP| over the train set per input id → `metrics.json`.
- Decision threshold: 0.5 on the calibrated probability (reported; no threshold tuning on the test set).

### 4.4 Expected performance (baseline, 5×3 CV on all 303 rows, uncalibrated)

| Target | ROC-AUC | Accuracy | F1 |
|---|---|---|---|
| CAD | 0.91 ± 0.04 | 0.86 | 0.90 |
| LAD | 0.83 ± 0.05 | 0.78 | 0.81 |
| LCX | 0.74 ± 0.07 | 0.68 | 0.59 |
| RCA | 0.71 ± 0.06 | 0.67 | 0.54 |

If a run lands far below these, suspect a preprocessing bug before tuning. **LCX/RCA are genuinely hard from non-imaging features.** State that openly in the UI and docs; it's a strength in Q&A, not a weakness.

### 4.5 Metrics stored (`artifacts/metrics.json`)
Per target:
- CV mean/std and test values for accuracy, precision, recall, F1, ROC-AUC, Brier
- prevalence
- ROC curve points (test)
- confusion matrix (test, threshold 0.5)
- calibration bins (10 quantile bins, OOF on train)

Global: split info, feature importance.

### 4.6 Artifacts (committed to git; `make train` regenerates them deterministically)
```
backend/artifacts/
  models/{CAD,LAD,LCX,RCA}.ubj   # XGBoost native format
  calibration.json               # {target: {a, b}}
  params.json, split.json, feature_stats.json (median/mode/min/max per input on train)
  metrics.json, presets.json, model_card.json (version, git sha, trained_at, data hash)
```
The API **loads** these at startup and never trains.

## 5. API (FastAPI, prefix `/api`)

Pydantic models are the source of truth. `make types` dumps the schema offline (`uv run python -m app.export_openapi > frontend/openapi.json`, no server needed) and runs `openapi-typescript` → `frontend/src/api/schema.d.ts`. Both files are **committed** (the Docker web build needs them). Never hand-write API types in TS.

| Method & path | Purpose |
|---|---|
| `GET /api/health` | `{status, model_version}` |
| `GET /api/features` | Form schema: `targets[{id, label, node}]` (node from `anatomy.yaml`), groups, and per-input `{id, label, group, kind, unit, input{min,max,step}, options[], reference{low,high}, observed{min,max}, default, help}`. Built from `features.yaml` + `anatomy.yaml` + `feature_stats.json`. |
| `GET /api/presets` | `[{id, label, description, values{input_id: value}, truth{CAD,LAD,LCX,RCA: bool}}]` |
| `POST /api/predict` | Body `{values: {input_id: value}}` (all 49 inputs; derived fields are ignored if sent) → response below |
| `GET /api/metrics` | Contents of `metrics.json` (typed) |

`POST /api/predict` response:
```jsonc
{
  "model_version": "2026-10-13-xgb-v1",
  "targets": {
    "CAD": { "probability": 0.78, "positive": true, "threshold": 0.5 },
    "LAD": { ... }, "LCX": { ... }, "RCA": { ... }
  },
  "explanations": {
    "CAD": {
      "base_probability": 0.71, "base_logit": 0.90,
      "contributions": [ { "id": "typical_chest_pain", "label": "Chest pain type", "display_value": "Typical angina", "logit": 1.12 } ]
      // all inputs, sorted by |logit| desc; frontend shows top 10 + "N others"
    }, "LAD": { ... }, "LCX": { ... }, "RCA": { ... }
  },
  "breakdown": [
    { "id": "ldl", "label": "LDL cholesterol", "value": 162, "unit": "mg/dL",
      "reference": { "low": 0, "high": 129 }, "status": "high",           // low | normal | high | null
      "outside_training_range": false,
      "contribution": { "CAD": 0.21, "LAD": 0.15, "LCX": 0.02, "RCA": -0.01 } }
  ],
  "warnings": ["Age 95 is outside the training data range (30–86)"]
}
```
- Validation: Pydantic rejects out-of-`input` bounds (422) with field-level messages. Values outside the *observed* training range are allowed but produce a warning.
- Latency target: < 50 ms per predict on CPU (4 models + contributions for 1 row).
- CORS: allow `http://localhost:5173` in dev. In Docker, nginx proxies `/api`, so it's same-origin.

## 6. Frontend

**Stack**: React 19, Vite, TypeScript (strict), Tailwind v4, shadcn/ui (+ shadcn charts / Recharts), lucide-react, sonner, Motion, Zustand, TanStack Query, react-hook-form + zod, three + @react-three/fiber v9 + @react-three/drei v10 + @react-three/postprocessing. Lint/format: Biome.

### 6.1 Layout (single page, desktop-first, min width 1280; graceful stacking below)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ⚠ Decision support / educational only — not a substitute for diagnostic    │  ← sticky, never dismissible
│   imaging or clinical judgement.                                            │
├────────────────────────────────────────────────────────────────────────────┤
│ CardioLens 3D        [Patient Workspace] [Model Performance] [About & Method]│
├──────────────┬────────────────────────────────┬────────────────────────────┤
│ PATIENT      │  3D HEART                       │ PREDICTIONS                │
│ Preset ▾     │  LAD/LCX/RCA coloured by risk   │ Overall CAD 78% ● Likely   │
│ ▸ Demograph. │  hover: name + %                │ [LAD 81%] [LCX 34%] [RCA 62%]
│ ▸ History    │  click: select + glow + fly-to  │ ⓘ disagreement note (cond.)│
│ ▸ Exam       │  [Reset] [Labels] [X-ray] [Spin]│ WHY · <selected target>    │
│ ▸ ECG        │  Legend 0% ── 50% ── 100%       │ SHAP bars (top 10 + others)│
│ ▸ Labs       │                                  │ base 71% → patient 78%     │
│ ▸ Echo       │                                  │ PHYSIOLOGICAL BREAKDOWN    │
│ ● live       │                                  │ value | ref | status | ±   │
└──────────────┴────────────────────────────────┴────────────────────────────┘
```

### 6.2 Patient Workspace behaviour
- **Form is generated from `GET /api/features`**. Adding a feature = edit `features.yaml` + retrain; no UI code changes.
  - Collapsible groups (shadcn Accordion).
  - Numbers: input + unit, with an out-of-reference-range badge.
  - Binary: Switch. Category/composite: Select or Toggle group.
  - BMI and obesity shown read-only (computed).
- **Presets** dropdown (from `/api/presets`). Loading one resets the form. The results panel then shows "Actual (catheterisation)" vs "Predicted" per target. This is the honesty feature for the demo.
- **Live updates**: on any valid change, debounce 300 ms → `POST /api/predict` via TanStack Query v5 (query key = debounced values, `placeholderData: keepPreviousData`, pass the `signal` to fetch so stale requests abort). Invalid form (zod) → no request, field errors shown. A small "live" indicator pulses while fetching.
- **Selection** (Zustand `selectedTarget: 'CAD'|'LAD'|'LCX'|'RCA'`, default `CAD`) is shared by the 3D scene, vessel cards and the WHY panel. Click a card ⇄ click a vessel do the same thing.
- **Disagreement note**: shown when CAD < 0.5 but any vessel ≥ 0.5, or CAD ≥ 0.5 but all vessels < 0.5. Text: *"Overall CAD and each vessel are predicted by separate models and can disagree. In the training data, almost every patient with a stenotic vessel was labelled CAD."*
- **WHY panel**: horizontal diverging bars (red = increases risk, blue/teal = decreases). Top 10 inputs + an aggregated "N other features" bar. Header: `Population base rate 71% → this patient 78%`. Axis label: "contribution (log-odds)". Tooltip shows the input's value.
- **Physiological breakdown**: table of numeric measurements and key binaries.
  - Columns: value + unit, reference range, status chip (low / normal / high), contribution to the *selected* target as a signed mini-bar.
  - Sortable by |contribution|.
  - Footnote: "Reference ranges are typical adult values for display only; the model uses raw values."

### 6.3 3D scene
- **Asset**: `public/models/heart.glb` built from BodyParts3D by `scripts/build_heart_glb.py` using `config/anatomy.yaml`. Node names `LAD`, `LCX`, `RCA`, `LM`, `heart`, `aorta`, `veins`. The frontend binds predictions to meshes **by the `targets[].node` names from `/api/features`**. No vessel list is hard-coded in TS. `tests/test_anatomy.py` checks every target in `features.yaml` maps to exactly one node in `anatomy.yaml`. At load, the scene logs an error and shows a toast if a target node is missing from the GLB.
- **Fallback**: if a vessel mesh is missing, render a `TubeGeometry` along a `CatmullRomCurve3` from `vessels.fallback.json`. Capture the points with a dev-only point picker (`?picker=1`: click heart surface → log coordinates).
- **Colour mapping** (`src/lib/riskColor.ts`): continuous probability → colour, interpolated in OKLCH. Stops: 0.0 green `#22c55e` → 0.5 amber `#f59e0b` → 1.0 red `#ef4444`. Emissive intensity grows with risk.
  - Colours animate (~400 ms) on change.
  - Never rely on colour alone: labels always show the %, and a legend bar is shown.
- **Heart muscle**: muted desaturated rose, slightly rough material. "X-ray" toggle makes it 25% opaque so posterior vessels (PDA) are visible.
  - LM and aorta: neutral. Veins: hidden by default.
- **Interaction**:
  - drei `CameraControls`: rotate / zoom / pan, with min/max distance clamped.
  - Hover → pointer cursor + `<Html>` tooltip (name, %).
  - Click a vessel → select + outline (postprocessing `Outline` / `Selection`) + camera fit to that vessel.
  - Click heart body → select CAD.
  - Click empty space / Reset → default view.
  - Optional auto-spin.
- **Labels**: `<Html>` anchored at each vessel's midpoint: "LAD 81%". Toggleable.
- **No-GPU performance**:
  - `dpr={[1, 1.5]}`, `frameloop="demand"` (invalidate on change and interaction), no shadows.
  - Small `Environment` preset or simple 3-light rig.
  - Total < 80k triangles, drei `PerformanceMonitor` to drop dpr.
  - Acceptance: usable (≥ 20 fps) in Chrome launched with `--disable-gpu`.

### 6.4 Model Performance tab
- Per-target cards: CV mean ± std and hold-out values for accuracy, precision, recall, F1, ROC-AUC, Brier, plus prevalence.
- ROC curves (all 4 on one chart + diagonal).
- Confusion matrices (2×2 heatmap tiles).
- Calibration plot (predicted vs observed + diagonal).
- Global feature importance (top 15, per-target selector).
- A "Validation protocol" box:
  - split, CV scheme, seed
  - leakage exclusion explicitly listed
  - calibration method
  - "presets are hold-out patients"

### 6.5 About & Method tab
Short sections:
- what it does
- dataset + citation
- pipeline diagram (simple SVG)
- how colour maps to probability
- limitations (n=303, single-centre, non-imaging features, LCX/RCA weaker, not clinically validated)
- full disclaimer
- credits (UCI dataset, BodyParts3D CC BY-SA 2.1 JP)

### 6.6 Visual direction
Calm clinical:
- Light neutral UI (slate/zinc), Inter or Geist font, generous spacing.
- **The 3D viewport sits on a dark navy radial gradient** so vessel colours pop.
- Risk colours are reserved for risk only: never use red/green for decoration.
- Motion is subtle: number tweening, panel fades. No gimmicks.

## 7. Architecture & repo layout

```
cardiolens-3d/
├─ README.md  LICENSE (MIT, code)  Makefile  docker-compose.yml  .gitattributes  .gitignore
├─ config/              features.yaml  anatomy.yaml
├─ data/raw/            z_alizadeh_sani_ext.csv (committed, cited) · bp3d/ (gitignored)
├─ backend/
│  ├─ pyproject.toml  uv.lock  Dockerfile
│  ├─ app/              main.py · api/routes.py · schemas.py · services/predictor.py · core/config.py
│  ├─ ml/               schema.py (loads features.yaml) · data.py · preprocess.py · split.py · train.py · evaluate.py · presets.py
│  │  └─ models/        base.py (RiskModel protocol + registry) · xgb.py
│  ├─ artifacts/        (see 4.6)
│  ├─ app/export_openapi.py (dumps OpenAPI JSON for `make types`)
│  └─ tests/            test_leakage.py · test_preprocess.py · test_api.py · test_explain_additivity.py · test_anatomy.py
├─ scripts/             build_heart_glb.py
├─ frontend/
│  ├─ package.json  vite.config.ts (proxy /api → :8000)  biome.json  Dockerfile  nginx.conf
│  ├─ public/models/    heart.glb  LICENSE-ASSETS.md
│  └─ src/
│     ├─ api/           schema.d.ts (generated) · client.ts · queries.ts
│     ├─ store/         app.ts (Zustand: selectedTarget, viewer toggles)
│     ├─ lib/           riskColor.ts · format.ts
│     ├─ components/ui/ (shadcn)
│     └─ features/      layout/ · patient/ · heart3d/ · results/ · performance/ · about/
└─ docs/                SPEC.md · PLAN.md · REPORT.md (≤6-page write-up source)
```

**Extensibility (explicitly judged)**:
- **New clinical feature** → `features.yaml` + `make train`.
- **New model** → implement `RiskModel`, register it.
- **New anatomical structure or target** → `anatomy.yaml` + `make assets`, + a target entry.

Nothing else hard-codes feature or vessel lists.

## 8. Tooling & reproducibility

- **Python 3.14.4 + uv**. `backend/.python-version` = `3.14.4`; `pyproject.toml` `requires-python = ">=3.14,<3.15"`; Ruff `target-version = "py314"`. All dependencies have Linux wheels for 3.14 (checked: numpy, pandas, scikit-learn, scipy, pydantic-core, pyyaml, fast-simplification ship cp314 wheels; xgboost and ruff wheels are Python-version-independent; the rest are pure Python). If `uv sync` ever tries to *compile* a package from source, stop and report it rather than installing build toolchains. Dependencies:
  - runtime: fastapi, uvicorn, pydantic v2, xgboost, scikit-learn, pandas, numpy, pyyaml
  - dev: pytest, httpx, ruff
  - optional `assets` group: trimesh, fast-simplification
- **Node LTS via nvm**. Lockfile committed.
- **Makefile**: `setup, dev, dev-api, dev-web, train, assets, types, lint, fmt, test, check (lint+test+typecheck), docker`.
- **Docker**: `docker compose up --build` → <http://localhost:8080>.
  - `api`: python:3.14-slim + uv (same minor version as dev), serves committed artifacts.
  - `web`: multi-stage node build → nginx, proxies `/api` to `api:8000`.
  - No training inside Docker.
  - **Build context is the repo root** for both images (the API needs `config/`; the web build needs `openapi.json`/`schema.d.ts`). Add a root `.dockerignore` (exclude `data/raw/bp3d`, `node_modules`, `.venv`).
- **Seeds** fixed everywhere (42). `model_card.json` records a data file hash + git sha.

## 9. Out of scope (for now)
- TabPFN / other models, a what-if before/after comparison, a torso shell, auth, persistence, mobile layout, i18n. Listed as stretch in PLAN.

## 10. Credits to include (README + About + report)
- Dataset (license CC BY 4.0, so committing it with attribution is fine): Alizadehsani, R., Roshanzamir, M., & Sani, Z. (2013). *extention of Z-Alizadeh sani dataset* [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5461K
- 3D anatomy: "BodyParts3D, Copyright© The Database Center for Life Science licensed by CC Attribution-Share Alike 2.1 Japan". The derived `heart.glb` is shared under the same license (`public/models/LICENSE-ASSETS.md`).