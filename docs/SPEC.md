# MyoGraph 3D — Specification

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
- Stratified **80/20 hold-out**, stratified on the *number of stenotic vessels (0–3)*, counted over the targets with `role: vessel` in `features.yaml`, so all four targets stay balanced. `random_state=42`. Saved as `artifacts/split.json` (row indices).
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
      def save(self, path) / load(cls, path, calibration)   # calibration (a, b) lives in calibration.json
  ```
  Adding TabPFN / LightGBM later = a new file implementing this, plus a registry entry. No other changes.
- Starting hyper-parameters (a quick baseline already gave the numbers in 4.4):
  `n_estimators=300, max_depth=3, learning_rate=0.05, subsample=0.8, colsample_bytree=0.8, min_child_weight=2, reg_lambda=1.0, scale_pos_weight=neg/pos (per target), eval_metric="logloss"`.
- Optional, time-boxed (skipped in Phase 2; baseline params used): a 20-iteration randomized search on train CV (ROC-AUC). Persist the chosen params in `artifacts/params.json`.

### 4.3 Calibration and explanations (exact, cheap)
- Get **out-of-fold raw margins** on train (5-fold), fit a 1-D logistic regression `logit_cal = a·margin + b` (Platt scaling). Then refit XGBoost on the full train set.
- Served probability = `sigmoid(a·margin + b)`.
- Per-patient SHAP = XGBoost's native TreeSHAP: `booster.predict(DMatrix, pred_contribs=True)`. This gives exact contributions + bias in margin space. Transform: `contrib_cal = a·contrib`, `base_cal = a·bias + b`.
  - Contributions plus base still sum exactly to the calibrated logit.
  - Use native `pred_contribs`, not the `shap` package, for serving: no version-compatibility risk. The `shap` package is optional, for offline plots only.
- **Display aggregation**: contributions of multi-column inputs (`bbb_*`, smoking, chest-pain) are **summed** back to their input id (exact, by additivity).
- **Global importance**: mean |SHAP| over the train set per input id → `metrics.json`.
- **Decision threshold (per target)**: the threshold maximising Youden's J (TPR − FPR) on the **train out-of-fold calibrated probabilities**; never the hold-out. Stored in `calibration.json`; the API uses it for `positive`. Inside each CV fold it is chosen from that fold's own training OOF, so CV stays honest. Both 0.5 and the tuned value are reported. Youden thresholds are noisy on n≈240 (see the CV spread in `metrics.json`).

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
- CV mean/std and test values for accuracy, precision, recall, F1, ROC-AUC, Brier, each at the default 0.5 and at the tuned threshold (`cv.{default,tuned}`, `test.{default,tuned}`); the threshold value and its CV-fold spread (`threshold`)
- prevalence
- ROC curve points (test)
- confusion matrix (test) at 0.5 and at the tuned threshold
- calibration bins (10 quantile bins, OOF on train)

Global: split info, feature importance.

`artifacts/stability.json` (`make stability`, separate from `make train`): hold-out ROC-AUC and Brier over split seeds 0..19 (same stratification, model seed 42) with median, IQR, min, max and the percentile of the official seed-42 hold-out. Touches no other artifact.

### 4.6 Artifacts (committed to git; `make train` regenerates them deterministically)
```
backend/artifacts/
  models/{CAD,LAD,LCX,RCA}.ubj   # XGBoost native format
  calibration.json               # {target: {a, b, threshold}}
  params.json, split.json, feature_stats.json (median/mode/min/max per input on train)
  metrics.json, presets.json, model_card.json (version, git sha, trained_at, data hash)
```
The API **loads** these at startup and never trains.

## 5. API (FastAPI, prefix `/api`)

Pydantic models are the source of truth. `make types` dumps the schema offline (`uv run python -m app.export_openapi > frontend/openapi.json`, no server needed) and runs `openapi-typescript` → `frontend/src/api/schema.d.ts`. Both files are **committed** (the Docker web build needs them). Never hand-write API types in TS.

| Method & path | Purpose |
|---|---|
| `GET /api/health` | `{status, model_version}` |
| `GET /api/features` | Form schema: `targets[{id, label, role, node}]` (`role` = `overall | vessel` from `features.yaml`; node from `anatomy.yaml`), groups, and per-input `{id, label, group, kind, unit, input{min,max,step}, options[], reference{low,high}, observed{min,max}, default, help}`. Built from `features.yaml` + `anatomy.yaml` + `feature_stats.json`. |
| `GET /api/presets` | `[{id, label, description, values{input_id: value}, truth{CAD,LAD,LCX,RCA: bool}}]` |
| `POST /api/predict` | Body `{values: {input_id: value}}` (all 49 inputs; derived fields are ignored if sent) → response below |
| `POST /api/intervals` | Same body as `/api/predict`. Returns `{model_version, targets{ID: {interval{lo,hi,level,method,n_models}, side: above\|below, uncertain: bool}}}`: the middle `level` share of the bootstrap replicates (config/uncertainty.yaml); `side` compares the POINT estimate with the target's threshold (`above` if p >= threshold); `uncertain` is true when the range crosses it (`lo < threshold <= hi`). Wording ("Above the model's cut-off" / "Below the model's cut-off" + "· uncertain") is served by `GET /api/display` from `config/display.yaml`. A separate call because ranges added ~65-105 ms p95 to `/api/predict` on the Docker image (budget +30 ms). |
| `POST /api/summary` | Body = `/api/predict` body plus optional `selected_target` (default: overall; unknown id → 422). Re-runs predict server-side (client numbers are never trusted), builds a `facts` object (per target: probability %, threshold %, range %, side above/below and uncertain flag for every target; top 3 increasing and top 3 decreasing `label: value` factors only for the overall target and the selected target, each block labelled with its target id; out-of-training-range warnings) and returns `{text, source: "groq" \| "template", model?}`. See §5.1. |
| `GET /api/metrics` | Contents of `metrics.json` (typed) plus `stability` (contents of `stability.json`: per-target median/IQR/min/max and the seed-42 percentile) and `excluded_inputs` (from `features.yaml`) |
| `GET /api/benchmark` | Contents of `benchmark.json` (typed, precomputed by `make benchmark`; nothing is trained at request time): same-protocol model comparison (logistic regression, random forest, XGBoost; TabPFN optional, offline, skipped when not installed) and an XGBoost ablation by feature group (`config/benchmark.yaml`). Paired per-fold differences use the Nadeau-Bengio corrected resampled t-test (`within_noise` = corrected CI contains 0); hold-out ROC-AUC is reported only. `/api/intervals` and `/api/summary` answer 503 + `Retry-After` until the bootstrap replicates, loaded in a background thread after startup, are ready. |

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
    { "id": "ldl", "label": "LDL cholesterol", "group": "labs", "kind": "number",  // kind: number | derived | binary
      "value": 162, "unit": "mg/dL",
      "reference": { "low": 0, "high": 129 }, "status": "high",           // low | normal | high | null
      "outside_training_range": false,
      "contribution": { "CAD": 0.21, "LAD": 0.15, "LCX": 0.02, "RCA": -0.01 } }
  ],
  "warnings": ["Age 95 is outside the training data range (30–86)"]
}
```
- `positive` is `probability >= threshold`, where `threshold` is the target's tuned (Youden, train OOF) threshold from `calibration.json`. `breakdown` lists numeric inputs, derived BMI/obesity and binaries (categories only appear in `explanations`).
- Validation: out-of-`input` bounds, non-finite numbers (NaN/±Infinity), missing inputs and unknown options are rejected (422) with field-level messages. Values outside the *observed* training range are allowed but produce a warning.
- Latency target: < 50 ms per predict on CPU (4 models + contributions for 1 row).
- CORS: allow `http://localhost:$WEB_PORT` and `http://127.0.0.1:$WEB_PORT` in dev (default 5180; the API runs on `API_PORT`, default 8010). In Docker, nginx proxies `/api`, so it's same-origin.

### 5.1 Summary endpoint
- **Structure** (template and Groq alike): S1 overall estimate; S2 vessel estimates in API order (every percentage stated); S3 the selected target named, with its main factors; an optional training-range caveat; then the disclaimer.
- **Template** (always available, deterministic): the structure above from the facts, ending with the disclaimer sentence ("These are model estimates for education and decision support, not a substitute for imaging or clinical judgement.").
- **Groq** (only if `GROQ_API_KEY` is set): ONLY the facts JSON is sent (never raw inputs) to Groq's OpenAI-compatible `POST https://api.groq.com/openai/v1/chat/completions` via `httpx`; strict system prompt (≤120 words, only the given numbers, no diagnosis/treatment/medication advice, "the model estimates", ends with the disclaimer); `temperature` 0, timeout 8 s; the prompt carries a placeholder-only one-shot example for tone. One retry after 2 s on HTTP 429, then the template. Validated Groq results are kept in a 256-entry in-process LRU cache keyed by (facts, model); template fallbacks are never cached. `GROQ_MODEL` is configurable (default `openai/gpt-oss-20b`; `llama-3.1-8b-instant` is not available to every account).
- **Validation**: output is rejected (→ template) if it lacks the disclaimer, exceeds ~120 words, contains a number not present in the facts, or omits any target's percentage, or mentions an input label that is not in the selected target's factor list, or matches `you have|you should|diagnos|treat|medicat|should take|prescrib|your doctor`. Errors and timeouts also fall back to the template. The key is never logged or returned.

## 6. Frontend

**Stack**: React 19, Vite, TypeScript (strict), Tailwind v4, shadcn/ui (+ shadcn charts / Recharts), lucide-react, sonner, Motion, Zustand, TanStack Query, react-hook-form + zod, three + @react-three/fiber v9 + @react-three/drei v10. Lint/format: Biome.

### 6.1 Layout (single page, desktop-first, min width 1280; graceful stacking below)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ⚠ Decision support / educational only — not a substitute for diagnostic    │  ← sticky, never dismissible
│   imaging or clinical judgement.                                            │
├────────────────────────────────────────────────────────────────────────────┤
│ MyoGraph 3D        [Patient Workspace] [Model Performance] [About & Method]│
├──────────────┬────────────────────────────────┬────────────────────────────┤
│ PATIENT      │  3D HEART                       │ PREDICTIONS                │
│ Preset ▾     │  LAD/LCX/RCA coloured by risk   │ Overall CAD 78% ● Above      │
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
- **Summary**: a "Summarise" button in the predictions panel (never automatic; disabled while the form is invalid) calls `POST /api/summary`. The text is cached per prediction values and selected target, and shown with a badge "AI-generated wording" (`groq`) or "Template summary", plus "Inputs are sent to Groq to word this summary." when the source is `groq`.
- **Disagreement note**: shown when the labels conflict: overall CAD is below its cut-off but any vessel is above its own, or overall CAD is above but no vessel is (each vs its own tuned threshold, i.e. the `positive` flags the cards show). Text: *"Overall CAD and each vessel are predicted by separate models and can disagree. In the training data, almost every patient with a stenotic vessel was labelled CAD."*
- **WHY panel**: horizontal diverging bars (red = increases risk, teal = decreases; contribution colours are distinct from the risk scale). Top 10 inputs + an aggregated "N other features" bar. Rendered as HTML rows (not a chart): left "<label>: <display value>" wrapping to at most 2 lines, right a diverging bar centred at 0 with the signed log-odds number; the row tooltip repeats label, value and logit. Header: `Average patient (model baseline) 71% → this patient 78%` (the base is the model's mean prediction over training patients, not the prevalence). Axis label: "contribution (log-odds)".
- **Physiological breakdown**: table of numeric measurements and key binaries.
  - Columns: value + unit, reference range, status chip (low / normal / high), contribution to the *selected* target as a signed mini-bar.
  - Sortable by |contribution|.
  - Footnote: "Reference ranges are typical adult values for display only; the model uses raw values."

### 6.3 3D scene
- **Asset**: `public/models/heart.glb` built from BodyParts3D by `scripts/build_heart_glb.py` using `config/anatomy.yaml`. Node names `LAD`, `LCX`, `RCA`, `LM`, `heart`, `aorta`, `veins`. The frontend binds predictions to meshes **by the `targets[].node` names from `/api/features`**. No vessel list is hard-coded in TS. `tests/test_anatomy.py` checks every target in `features.yaml` maps to exactly one node in `anatomy.yaml`. At load, the scene logs an error and shows a toast if a target node is missing from the GLB.
- **Fallback**: if a vessel mesh is missing, render a `TubeGeometry` along a `CatmullRomCurve3` from `vessels.fallback.json`. Capture the points with a dev-only point picker (`?picker=1`: click heart surface → log coordinates).
- **Colour mapping** (`src/lib/riskColor.ts`): continuous probability → colour, interpolated in OKLCH. Stops: 0.0 green `#22c55e` → 0.5 amber `#f59e0b` → 1.0 red `#ef4444`. Emissive intensity grows with risk.
  - Colours animate (~400 ms) on change.
  - Never rely on colour alone: labels always show the %, and a legend bar is shown. Probabilities are shown as integer % everywhere; the legend marks each target's tuned decision threshold with a tick (faint, id + value in the tooltip) and labels only the selected target's ("CAD threshold 48%").
- **Heart muscle**: muted desaturated rose, slightly rough material. "X-ray" toggle makes it 25% opaque so posterior vessels (PDA) are visible.
  - LM and aorta: neutral. Veins: hidden by default, shown by a toolbar toggle (neutral blue-grey, not clickable). The toggle appears for any optional, default-hidden node in the GLB extras.
- **Interaction**:
  - drei `CameraControls`: rotate / zoom / pan, with min/max distance clamped.
  - Hover → pointer cursor + DOM tooltip (name, %).
  - Click a vessel → select + thicker, lighter outline (drei `<Outlines>`, see v2.0) + the camera orbits to that node's view direction (`viewDir` extra: optional `view_dir`, else derived from `expect_side`: anterior front, right front-right ~45°, left left-lateral ~110°) and fits its bounding box.
  - Click heart body → select CAD.
  - Click empty space / Reset → default view.
  - Optional auto-spin.
- **Labels** (v2.0: DOM chips with leader lines, see below; originally drei `<Html>`) anchored at each vessel's `anchor` (glTF node extras, written by `build_heart_glb.py`: a point ON the vessel surface, not the centroid, which can lie inside the heart): "LAD 81%". Toggleable; the legend and result cards always show the numbers.
- **No-GPU performance**:
  - `dpr={[1, 1.5]}`, `frameloop="demand"` (invalidate on change and interaction), no shadows.
  - Small `Environment` preset or simple 3-light rig.
  - Total < 80k triangles. `useGLTF(url, false)`: no Draco decoder fetch.
  - No post-processing. Selection is shown by an emissive boost and a thicker, lighter outline. The budget
    monitor (`FrameBudget.tsx`) lowers dpr one rung per decline (1.5/1.25 -> 1 -> 0.75), never back up; it
    replaces drei's `PerformanceMonitor`, which counts frames per wall-clock window and so misreads idle time
    under `frameloop="demand"` as a slow GPU.
  - Click/drag: a press that travels >= 5 px is a drag; vessel, heart and empty-space clicks only fire for
    real clicks, so orbiting never changes selection or camera.
  - The workspace tab stays mounted while hidden; the canvas invalidates (without re-framing) when shown again.
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
- credits (UCI dataset, BodyParts3D CC BY 4.0, derived heart.glb CC BY-SA 4.0)

### 6.6 Visual direction
Calm clinical:
- Light neutral UI (cool slate neutrals, hue ~255, low chroma), generous spacing. One teal-blue accent for interaction/selection.
- **Type pairing: Geist (UI) + Geist Mono** (all numbers, units, probabilities via the `.num` utility, tabular figures).
- All colour, type and layout-scale values live as tokens in `frontend/src/index.css` (`--risk-*`, `--notice-*`, `--viewport-*`, `--gutter`, …).
- **The 3D viewport sits on a dark navy radial gradient** so vessel colours pop.
- Risk colours are reserved for risk only: never use red/green for decoration.
- Motion is subtle: number tweening, panel fades. No gimmicks.

## 7. Architecture & repo layout

```
myograph-3d/
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
│  ├─ package.json  vite.config.ts (port 5180 strict, proxy /api → :8010)  biome.json  Dockerfile  nginx.conf
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
  - runtime: fastapi, uvicorn, pydantic v2, xgboost, scikit-learn, pandas, numpy, pyyaml, httpx, python-dotenv
  - dev: pytest, ruff
  - optional `assets` group: trimesh, fast-simplification
- **Node LTS via nvm**. Lockfile committed.
- **Makefile**: `setup, dev, dev-api, dev-web, train, assets, types, lint, fmt, test, check (lint+test+typecheck), docker`.
- **Docker**: `docker compose up --build` → <http://localhost:8080>.
  - `api`: python:3.14-slim + uv (same minor version as dev), serves committed artifacts.
  - `web`: multi-stage node build → nginx, proxies `/api` to `api:8000`.
  - No training inside Docker.
  - **Build context is the repo root** for both images (the API needs `config/`; the web build needs `openapi.json`/`schema.d.ts`). Add a root `.dockerignore` (exclude `data/raw/bp3d`, `node_modules`, `.venv`).
- **Environment** (root `.env`, git-ignored; `.env.example` is committed): `GROQ_API_KEY` (optional; enables Groq wording of the summary) and `GROQ_MODEL` (optional). Real environment variables win over `.env`. The app works fully without either. `docker compose` passes `.env` via `env_file` with `required: false`.
- **Serving thread-safety**: FastAPI runs the sync routes in a threadpool, so each `XGBRiskModel` holds a `threading.Lock` around `predict` and `pred_contribs` (the XGBoost docs do not explicitly name `pred_contribs` as thread-safe). Predictions are tiny (1 row), so the lock costs nothing measurable.
- **Seeds** fixed everywhere (42). `model_card.json` records a data file hash + git sha.

## 9. Out of scope (for now)
- TabPFN / other models, a what-if before/after comparison, a torso shell, auth, persistence, mobile layout, i18n. Listed as stretch in PLAN.

## 10. Credits to include (README + About + report)
- Dataset (license CC BY 4.0, so committing it with attribution is fine): Alizadehsani, R., Roshanzamir, M., & Sani, Z. (2013). *extention of Z-Alizadeh sani dataset* [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5461K
- 3D anatomy (BodyParts3D 4.0): "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International". The BodyParts3D site states CC BY 4.0, but the source OBJ headers still embed CC BY-SA 2.1 Japan. The derived `heart.glb` is therefore released under CC BY-SA 4.0, which satisfies both; the repo's code remains MIT (`public/models/LICENSE-ASSETS.md`).

## v2.0

### Phase 16b: story mode
- **`config/stories.yaml`** (validated by `backend/ml/stories.py` at startup and in `tests/test_stories.py`, served by
  `GET /api/stories`): `stories[{id, title, blurb, preset, steps[{id, camera?{target}, highlight?{target, direction
  up|down, top}, reveal_truth, parts[{text, when[]}]}]}]`. `preset` must be a hold-out preset; targets are target ids
  (the browser maps them to mesh nodes through `/api/features`). Four stories: a low estimate (no-cad), one artery
  stands out (lad-only), three arteries, one patient (3-vessel), when the model is confidently wrong (hard-case).
- **Text rules (enforced):** no digits or `%` (every number is a token filled from the API at runtime); a part that
  states an outcome or comparison (agree, miss, above/below, far, well, wrong, ...) needs a `when`; a step keeps one
  part with no `when` and no factor token; `{truth:ID}` only on a `reveal_truth` step; no ranking of arteries; no
  clinical advice. Tokens: `{p:ID}`, `{thr:ID}`, `{truth:ID}` ("narrowing (stenosis) found" / "no narrowing found"),
  `{name:ID}`, `{plain:ID}`, `{where:ID}`, `{n_patients}` (dataset size, `factor_note` only), `{factors_up:N}`, `{factors_down:N}` (up to N signed factors of the
  highlight target, each as `label: value` (the API `display_value`), joined; a part whose list is empty is skipped). Conditions: `above_threshold`, `below_threshold`,
  `well_above_threshold`, `well_below_threshold` (0.25 beyond the threshold), `agrees`, `disagrees` (model verdict vs real
  result), `all_agree`, `any_disagrees`.
- **`factor_note`** (top-level key of `stories.yaml`, same text rules): one closing sentence appended to every step that
  renders a `{factors_*}` list.
- **`unit_singular`** (optional, `features.yaml`, needs `unit`): unit text used when the value is exactly 1 (Region RWMA:
  `regions` / `region`); exposed on `/api/features` and `breakdown` rows.
- **Player** (`frontend/src/features/story`): a card under the heart with Back / Next (Finish) / Exit, arrow keys and Esc;
  offered once per browser as a toast ("See how it works · 1 min", `localStorage` key `myograph.story-seen`),
  replayable from the header button "How it works". Starting loads the story's hold-out patient into the form
  (`preset_loaded` with `source: "story"`); each step selects and frames its target (instant cut under reduced
  motion), marks the factors it names in the results panel and keeps the real result hidden (preset name, cath
  column) until a reveal step. Exit or Finish restores the patient from before (values, preset, edited flag, selection).
  The story's numbers come from its own prediction of the preset (same `/api/predict`).
- Analytics: `story_started {story}` on start, `story_completed {story}` on Finish (not on early exit).
- Dev-only test seam: `window.__trackLog` (installed by Playwright) records `track()` calls.

### Phase 16a2: balanced supply regions
- BodyParts3D has no circumflex branches beyond FMA3895 (the left marginal vein is a vein), so `anatomy.yaml` nodes may
  override `territory_falloff_mm` / `territory_max_mm`; LCX uses 22 / 45 mm (global 12 / 30). Share of heart vertices with
  weight > 0.5: LAD 20 %, LCX 22 %, RCA 29 % (LCX was 8 %). A test requires every channel to reach at least half of the largest.

### Phase 16a: scene (outlines, focus, supply regions, labels)
- **Colour = risk only.** Vessel identity comes from outlines, name chips with leader lines, position, the
  vessel key and interaction, so three vessels at nearly the same probability stay distinguishable. The number
  is always shown next to a colour (chips, key, tooltip).
- **Outlines:** drei `<Outlines>` (inverted hull, no post-processing, `@react-three/postprocessing` removed) on
  every vessel mesh: thin dark by default, thicker and light for the selected / hovered vessel.
- **Materials:** `MeshPhysicalMaterial`; heart muted rose, rough, light sheen, darker than the vessels; vessels
  risk colour + risk-scaled emissive + light clearcoat. 3 directional lights + ambient + a soft cool rim. No
  shadows.
- **Focus mode:** with a vessel selected the other vessels fade to 35 % and lose 65 % of their saturation, the
  heart dims slightly (tween 300 ms, instant under `prefers-reduced-motion`). Reset / selecting the heart (CAD)
  restores everything.
- **Supply-region shading** (toolbar "Supply area", default on): the heart's `_territory` attribute (exposed as
  `territory`) channel of the selected vessel, found through the heart node's `territoryChannels` extra, tints
  the surface with that vessel's risk colour (max 70 %). Caption: "Shaded area: approximate region the <id>
  supplies". None for overall CAD. Never a clinical map.
- **Labels:** one DOM chip per vessel target ("LAD · 81%", "LAD 81%" on phones) outside the heart's projected
  silhouette with an SVG leader line and anchor dot; positions are written to the DOM every frame (no re-render);
  per-side vertical relaxation prevents overlap; where the canvas is too narrow the chip is clamped inside the
  view. A vessel behind the heart (X-ray off) keeps a dashed chip, line and hollow dot. Chips are buttons: tap /
  click / Enter select.
- **View presets:** Front / Left side / Underside (anatomical axes; if exactly one vessel's `viewDir` extra
  points along the axis, that vessel's own `viewDir` is used) plus Reset, and a tiny A/P/L/R compass that follows
  the camera azimuth.
- **Vessel key:** inside the legend, one row per target from `/api/features` (`id`, `where` from anatomy.yaml,
  risk dot and %). `targets[].where` is a new, additive API field. Row click selects and flies to the vessel.
- **Keyboard:** Tab reaches the chips and key rows (visible focus ring), Enter / Space select, Esc resets.
- **No-GPU:** `frameloop="demand"`; software GL (SwiftShader/llvmpipe, detected from the renderer string)
  starts at dpr 1 with MSAA off, which is the largest single cost on a CPU rasteriser. Phones and coarse
  pointers load `heart.mobile.glb` and cap dpr at 1.25.
- **Console:** the Playwright check (`make e2e`) fails on any console error/warning. The allow-list is in
  `frontend/e2e/helpers.ts`; one entry: R3F 9.8.x creates `new THREE.Clock()`, which three 0.186 warns about.
- Charts mount only while the Performance tab is active (Recharts measured 0x0 in a hidden panel).

### Phase 15: heart asset v2
- **Two GLBs** from one build (`make assets`): `heart.glb` (< 80k triangles, <= 2 MB) and `heart.mobile.glb`
  (< 40k, <= 1 MB). Same node names and extras; per-node budgets `max_triangles` / `max_triangles_mobile`.
- **Thicker vessels:** per-node `inflate` (source mm) along smoothed vertex normals, duplicate vertices merged
  first, displacement capped at `inflate_edge_ratio` x local edge length. The build reports requested vs applied
  and warns when the cap removes more than half.
- **Supply regions:** the heart mesh carries a custom `_TERRITORY` vertex attribute (three.js:
  `geometry.attributes._territory`), one 0-1 channel per `territory: true` node, from the distance to that
  artery (`territory.falloff_mm`, `territory.max_mm`), computed on each LOD's final heart vertices. Channel
  order is in the heart node's `territoryChannels` extra. It is an *approximate, nearest-artery illustration*
  of the region each artery supplies, never a clinical map.
- `config/anatomy.yaml` is validated by `backend/ml/anatomy.py`; `scripts/inspect_glb.py` prints both files.

### Phase 14: visitor analytics and real client IPs
- **Client IP** (`app/core/client_ip.py`): `x-nf-client-connection-ip`, else the left-most globally routable
  `X-Forwarded-For` entry, else the socket peer; malformed values ignored. `TRUST_PROXY_HEADERS` (default
  `true`; `false` = socket peer only). `LOG_IP_MODE=full|truncated` (truncated zeroes the last IPv4 octet or the
  last 80 bits of IPv6). Forgeable by direct callers of the Render URL: analytics only, never a security input.
- **Access log** (`app/core/access_log.py`): pure ASGI middleware, registered outermost (CORS preflights and
  unhandled exceptions, logged as `status=500`, are included). One line per request:
  `access ip= method= path= status= ms= rid= [rid_nf=] ua= ref=`. Never query strings or bodies; UA cut to 120
  chars and escaped; referer reduced to scheme+host+path; `X-Request-ID` response header; `/api/health` at DEBUG.
  Logger `myograph.access` is configured explicitly (INFO, stdout, `propagate=False`) because uvicorn runs with
  `--no-access-log` and the root logger would otherwise hide it. `rid_nf` is Netlify's `x-nf-request-id`.
- **Analytics** (`src/lib/analytics.ts`, PostHog, lazy-loaded after first paint): active only for a production
  build with `VITE_POSTHOG_KEY` set and `location.hostname` in `VITE_POSTHOG_DOMAINS`. Config: `cookieless_mode:
  "always"`, `person_profiles: "never"`, `autocapture: false`, session recording, heatmaps, dead clicks and
  surveys off, `respect_dnt`, pageview and pageleave on. `before_send` strips `?query` and `#hash` from
  `$current_url`, `$referrer`, `$pathname` and URL-like `$initial_*` / `$prev_*` properties.
- **Events** (property allow-list enforced in `track()`): `preset_loaded {preset, source: auto|user|story}`,
  `target_selected {target, source: 3d|list}`, `tab_viewed {tab}`, `form_edited` (once per session),
  `summary_requested`, `view_toggled {control}`, `story_started {story}`, `story_completed {story}`. Never a field value, probability or free text.
  `quick_mode_used` and `shared_link_opened` arrive with Phase 18.
- No Netlify `/ingest` reverse proxy: events from ad-blocking visitors are lost, which is accepted.
- `netlify.toml` sets no CSP, so no allow-listing was needed. `render.yaml` carries `TRUST_PROXY_HEADERS` and
  `LOG_IP_MODE` as plain values. Frontend unit tests use vitest (`npm test`, part of `make test`).


### Phase 16.5: uncertainty ranges
- **`config/uncertainty.yaml`** (`method: bootstrap`, `n_models`, `level`, `seed`; validated by `backend/ml/uncertainty.py`).
  `make train` refits each target `n_models` times on a stratified bootstrap resample of the train patients (same fixed
  params), Platt-calibrated on each replicate's out-of-bag patients (own-model coefficients if the OOB set has < 5 of a
  class). Stored as `backend/artifacts/models/replicates/{T}.bin.gz` (deterministic bytes). The point estimate stays the
  main model; the range is the replicates' 5th-95th percentile. `metrics.json` gains `uncertainty` (hold-out mean width and
  how often the point estimate lies outside its own range).
- Served by `POST /api/intervals` (see API table); the frontend shows the point first and the range when it arrives.
- Meaning, everywhere: "The range shows how much the estimate depends on which patients the model learned from. It is not a
  guarantee, and not the range of your true risk." `positive` (point >= threshold) still drives agree/miss against the cath
  result; the main label compares the point estimate with the threshold (Above / Below the model's cut-off), with an "uncertain" qualifier when the range crosses it (Phase 16.5c). `metrics.json` `uncertainty.targets[T]` also has `n_uncertain` / `uncertain_fraction` (hold-out range crosses the threshold), shown on the Performance tab.
- Stories: token `{range:ID}`; conditions `range_crosses_threshold:ID`, `range_clear_of_threshold:ID`.

### Phase 17: plain-language results and waterfall
- **`config/display.yaml`** (validated by `backend/ml/display.py`, served by `GET /api/display`): threshold labels, headline,
  base-rate note, waterfall/dot captions, performance one-liners, trust box, glossary. Unknown keys or placeholders fail at startup.
- **`outcome_phrase`** (optional per target in `features.yaml`, in `TargetInfo`): "probability of <outcome_phrase>".
- **Waterfall** (`ml/waterfall.py`, `TargetExplanation.waterfall`): starts at the model baseline `sigmoid(base)` (not the dataset
  prevalence; each target has its own), adds factors largest |log-odds| first (id tie-break), top `waterfall_top_n` (6) as steps
  plus one "N other factors" step; the last `to_p` equals the served probability (the chain closes to 1e-6, tested). Step sizes
  depend on order. This replaces the SHAP-bar WHY view of 6.2 as the default; the log-odds bars live under "Technical details".
- Base-rate note and baseline caption use the selected target's own prevalence from `metrics.json`. Dot picture: solid dots to the
  start of the range, lighter dots across it, ring on the estimate, number always printed. Story factor tokens use waterfall steps
  (never the "other factors" row); `/api/summary` facts use them too and the validator requires the "trained on N patients" sentence.
