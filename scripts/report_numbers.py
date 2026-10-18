"""Regenerate the numbers in docs/REPORT.md from artifacts/config files.

Usage (from the repo root):
    python3 scripts/report_numbers.py            # refresh marked values in docs/REPORT.md in place
    python3 scripts/report_numbers.py --init     # overwrite docs/REPORT.md with the full seed text

Every generated value in REPORT.md sits between <!--v:KEY--> ... <!--/v--> markers. Prose outside
the markers is hand-edited and left untouched; markers whose key no longer appears are skipped.
Needs PyYAML and `uv` (runs `pytest --collect-only` for the test count).
"""
import json, re, struct, subprocess, sys
from pathlib import Path
import yaml

R = Path(__file__).resolve().parent.parent
INIT = "--init" in sys.argv
A = R / "backend/artifacts"
M = json.loads((A / "metrics.json").read_text())
S = json.loads((A / "stability.json").read_text())
C = json.loads((A / "calibration.json").read_text())
P = json.loads((A / "params.json").read_text())
MC = json.loads((A / "model_card.json").read_text())
PR = json.loads((A / "presets.json").read_text())
F = yaml.safe_load((R / "config/features.yaml").read_text())
AN = yaml.safe_load((R / "config/anatomy.yaml").read_text())
T = M["targets"]
ids = list(T)
vessels = [t for t in ids if T[t]["role"] == "vessel"]
sp = M["split"]; cvc = M["cv"]
kinds = {}
for f in F["features"]:
    kinds[f["kind"]] = kinds.get(f["kind"], 0) + 1
n_in = len(F["features"]) - kinds.get("derived", 0)  # client-sent inputs: derived are server-side

# GLB
b = (R / "frontend/public/models/heart.glb").read_bytes()
jl, _ = struct.unpack_from("<II", b, 12)
g = json.loads(b[20:20 + jl])
tri = {}
for n in g["nodes"]:
    m = g["meshes"][n["mesh"]]
    tri[n["name"]] = sum(g["accessors"][p["indices"]]["count"] // 3 for p in m["primitives"])
hidden = {n["name"] for n in g["nodes"] if not n.get("extras", {}).get("defaultVisible", True)}
tot = sum(tri.values()); vis = sum(v for k, v in tri.items() if k not in hidden)
lim_tri = AN["budget_desktop"]["max_triangles"]
lim_sz = AN["budget_desktop"]["max_bytes"]
budget = {n["name"]: n["max_triangles"] for n in AN["nodes"]}

# tests
out = subprocess.run(["uv", "run", "pytest", "--collect-only", "-q"], cwd=R / "backend", capture_output=True, text=True).stdout
n_tests = int(re.search(r"(\d+) tests? collected", out).group(1))
test_files = sorted(p.name for p in (R / "backend/tests").glob("test_*.py"))

pb = lambda d: d["prevalence"]["train"]*(1-d["prevalence"]["train"])
pc = lambda x: f"{100*x:.0f}%"
f3 = lambda x: f"{x:.3f}"
ms = lambda d: f"{d['mean']:.3f} ± {d['std']:.3f}"

def table(head, rows):
    s = "| " + " | ".join(head) + " |\n|" + "|".join("---" for _ in head) + "|\n"
    return s + "\n".join("| " + " | ".join(map(str, r)) + " |" for r in rows) + "\n"

res = table(["Target", "Prevalence (train / test)", "ROC-AUC CV", "ROC-AUC hold-out", "Brier CV", "Brier hold-out"],
    [[T[t]["label"], f"{pc(T[t]['prevalence']['train'])} / {pc(T[t]['prevalence']['test'])}",
      ms(T[t]["cv"]["tuned"]["roc_auc"]), f3(T[t]["test"]["tuned"]["roc_auc"]),
      ms(T[t]["cv"]["tuned"]["brier"]), f3(T[t]["test"]["tuned"]["brier"])] for t in ids])
thr = table(["Target", "Tuned threshold", "CV spread of threshold", "Recall CV", "Recall hold-out", "F1 CV", "F1 hold-out", "F1 hold-out at 0.5"],
    [[T[t]["label"], f3(T[t]["threshold"]["tuned"]), f"{T[t]['threshold']['cv_mean']:.3f} ± {T[t]['threshold']['cv_std']:.3f}",
      ms(T[t]["cv"]["tuned"]["recall"]), f3(T[t]["test"]["tuned"]["recall"]),
      ms(T[t]["cv"]["tuned"]["f1"]), f3(T[t]["test"]["tuned"]["f1"]), f3(T[t]["test"]["default"]["f1"])] for t in ids])
st = table(["Target", "Seed-42 AUC", "Median", "IQR", "Min – max", "Seed-42 percentile"],
    [[T[t]["label"], f3(S["targets"][t]["roc_auc"]["official"]), f3(S["targets"][t]["roc_auc"]["median"]),
      f"{S['targets'][t]['roc_auc']['q25']:.3f} – {S['targets'][t]['roc_auc']['q75']:.3f}",
      f"{S['targets'][t]['roc_auc']['min']:.3f} – {S['targets'][t]['roc_auc']['max']:.3f}",
      f"{S['targets'][t]['roc_auc']['official_percentile']:.0f}"] for t in ids])
cal = table(["Target", "a (slope)", "b (intercept)"], [[t, f3(C[t]["a"]), f3(C[t]["b"])] for t in ids])
tri_rows = [[k, tri[k], budget.get(k, "-"), "hidden by default" if k in hidden else ("optional" if next(n for n in AN['nodes'] if n['name']==k).get('optional') else "")] for k in tri]
tri_t = table(["Node", "Triangles", "Budget", "Note"], tri_rows)
imp = table(["Target", "Top-3 inputs by mean \\|SHAP\\| (log-odds)"],
    [[t, ", ".join(f"{x['label']} ({x['importance']:.2f})" for x in M["feature_importance"][t][:3])] for t in ids])
dropped = ", ".join(d["column"] for d in F["dropped"])
excl = ", ".join(f"`{c}`" for c in F["excluded_from_inputs"])
cad, lcx, rca = T["CAD"], T["LCX"], T["RCA"]
pre = [p["id"] for p in PR]
worst = max(ids, key=lambda t: S["targets"][t]["brier"]["official_percentile"])

def _repo() -> str:
    url = subprocess.run(["git", "remote", "get-url", "origin"], cwd=R, capture_output=True, text=True, check=True).stdout.strip()
    url = re.sub(r"^git@([^:]+):", r"https://\1/", url)
    url = re.sub(r"^ssh://git@", "https://", url)
    return re.sub(r"\.git$", "", url)

REPO = _repo()

def V(key: str, val) -> str:
    val = str(val)
    # Blank lines around multi-line values so markdown tables are not swallowed by the HTML comment.
    body = f"\n\n{val}\n" if "\n" in val else val
    return f"<!--v:{key}-->{body}<!--/v-->"


md = f"""# MyoGraph 3D: coronary artery disease probabilities on an interactive 3D heart

*Track A, Multimodal AI Hackathon 2026: Cardiovascular Risk Visualization & Prediction.*

Swayam Bansal  
Repository: {V('c0de5afe', REPO)}  
Demo video: https://youtu.be/UWsbB-3spT4

*Model version <code>{V('784a6c5e', MC['model_version'])}</code>, trained {V('9e5b60cb', MC['trained_at'][:10])}. Generated values come from the committed artifacts via `scripts/report_numbers.py`.*

## 1. Problem and approach

Track A asks for a system that predicts cardiovascular risk and makes it visible. MyoGraph 3D takes a patient's clinical record (demographics, history, examination, ECG, laboratory values, echocardiography) and returns model estimates of the probability of overall coronary artery disease (CAD) and of stenosis in each of {V('b8365ee1', len(vessels))} coronary arteries ({V('a1ea9bb9', ", ".join(vessels))}). Those probabilities are painted live onto a 3D heart, so the user sees which vessel the model considers most likely to be narrowed, and the number next to it.

Three ideas shape the design. First, honest validation: a fixed hold-out, repeated cross-validation on the training part only, and a split-stability analysis that shows how much one lucky or unlucky split can move a score. Second, calibrated, explainable output: every probability is calibrated and decomposes exactly into per-input contributions. Third, one source of truth: the feature schema and the target-to-mesh map live in two YAML files, and the backend, API, form and 3D scene all derive from them.

![MyoGraph 3D workspace](img/workspace-3vessel.png)
*Figure 1. Patient workspace with a three-vessel hold-out preset (`docs/img/workspace-3vessel.png`).*

## 2. Data and preprocessing

**Dataset.** UCI *Extension of Z-Alizadeh Sani* (Alizadehsani, Roshanzamir & Sani, 2013; CC BY 4.0; doi:10.24432/C5461K): {V('02567bfe', sp['n_train'] + sp['n_test'])} patients, one row each, no missing values. Targets are overall CAD (catheterisation label) and stenosis of {V('a1ea9bb9', ", ".join(vessels))}. Positive rates in the training split: {V('392a8ee4', ", ".join(f"{t} {pc(T[t]['prevalence']['train'])}" for t in ids))}.

**Quirks handled in `config/features.yaml`.**
- `Sex` contains the typo `Fmale`, mapped to female.
- Binary columns mix `Y`/`N` and `1`/`0`; each feature lists the raw values that mean yes.
- `VHD` has a lowercase `mild`; it becomes an ordinal 0–3.
- {V('41d368a5', dropped)} is constant and dropped.
- `BMI` and `Obesity` are derived from weight and height, server-side, and recomputed for training as well, so training and serving share one code path (this overrides one inconsistent `Obesity` row).
- Composites: smoking status and chest-pain type are mutually exclusive in the data, so each is one input that expands into several dataset columns; `BBB` is one-hot encoded.

**Leakage exclusion.** {V('2afdc52a', excl)} are never model inputs for any target, including the other vessels when predicting one vessel. A test (`test_leakage.py`) enforces this from the schema.

**Schema-driven.** The schema holds {V('f03de691', len(F['features']))} features: {V('0a9b9168', ", ".join(f"{v} {k}" for k, v in kinds.items()))}. The client sends {V('205802c8', n_in)} inputs (derived fields are ignored if sent). No feature or vessel list is hard-coded in Python or TypeScript.

## 3. Model and validation

**Model.** One `XGBClassifier` per target behind a common `RiskModel` interface: {V('cfe725fb', P['params']['n_estimators'])} trees, depth {V('a96d79f5', P['params']['max_depth'])}, learning rate {V('7f74c2e7', P['params']['learning_rate'])}, subsample {V('5ffef6f7', P['params']['subsample'])}, column sample {V('ef252d87', P['params']['colsample_bytree'])}, `min_child_weight` {V('c5798654', P['params']['min_child_weight'])}, L2 {V('56a66a64', P['params']['reg_lambda'])}, and `scale_pos_weight` set per target to negatives/positives. No hyper-parameter search was run.

**Protocol.**
1. Stratified {V('62e1df95', int(sp['test_size']*100))}% hold-out (seed {V('d48b9ef9', sp['seed'])}), stratified on the number of stenotic vessels (0–{V('b8365ee1', len(vessels))}) so all four targets stay balanced: {V('20b77c54', sp['n_train'])} train, {V('8e1d23bb', sp['n_test'])} test.
2. Development metrics: {V('60f98b3a', cvc['n_splits'])}-fold stratified CV repeated {V('da9de890', cvc['n_repeats'])} times (seed {V('0c04690c', cvc['seed'])}) on the training set only. The hold-out is a final sanity check; it is never used for tuning or for CV.
3. Calibration: out-of-fold raw margins on train, then Platt scaling `logit = a·margin + b`; the final model is refit on all training rows. The served probability is `sigmoid(a·margin + b)`.
{V('912b498a', cal)}
4. Decision thresholds: Youden's J maximiser on the training out-of-fold calibrated probabilities (never the hold-out). Inside each CV fold the threshold comes from that fold's own training predictions, so CV stays honest.

**Results.** CV is the primary figure (mean ± std over {V('147bfeaf', cvc['n_splits'] * cvc['n_repeats'])} folds); the hold-out has n = {V('8e1d23bb', sp['n_test'])} and is noisy.

{V('9b207167', res)}
Brier scores do not depend on the threshold. Threshold-dependent metrics at the tuned thresholds:

{V('bb629dea', thr)}
Youden thresholds are noisy at this sample size: the spread across CV folds is shown above, and the tuned value can lower or raise F1 relative to 0.5 (last column). Prevalence matters for reading these numbers: a constant predictor of the majority class would reach accuracy {V('bff2710f', pc(cad['prevalence']['test']))} on overall CAD in the hold-out, so Brier and ROC-AUC are the more informative figures.

**Split stability.** The hold-out ROC-AUC and Brier were recomputed over {V('e1978be2', len(S['seeds']) + 1)} splits (the official seed plus seeds 0–{V('5e51baeb', S['seeds'][-1])}; same stratification, same model seed). Seed {V('de5b8f63', S['official_seed'])} is the {V('52c34228', 'hardest' if S['targets']['CAD']['roc_auc']['official_percentile'] == 0 else 'a hard')} split for overall CAD: its AUC is the lowest of the {V('e1978be2', len(S['seeds']) + 1)} splits, and its Brier score is at percentile {V('d293b3bc', format(S['targets']['CAD']['brier']['official_percentile'], '.0f'))} (the worst).

{V('627fcdb6', st)}
The headline hold-out CAD AUC ({V('6f80ea39', f3(cad['test']['tuned']['roc_auc']))}) is therefore a pessimistic draw; the median over seeds is {V('d9140f46', f3(S['targets']['CAD']['roc_auc']['median']))}. We kept seed {V('de5b8f63', S['official_seed'])} as the official split because it was fixed before the stability analysis, and report the spread instead of choosing a friendlier seed.

## 4. Interpretability

**TreeSHAP in calibrated log-odds.** At serve time the app uses XGBoost's native `pred_contribs`, which gives exact TreeSHAP contributions in margin space. They are scaled by the calibration slope `a`, and the bias becomes `a·bias + b`. Contributions plus base value therefore sum exactly to the calibrated logit, which `test_explain_additivity.py` verifies.

**WHY panel.** For the selected target, the top 10 inputs are shown as diverging bars (red raises the estimate, teal lowers it) in log-odds, with the header "average patient (model baseline) → this patient". Global importance on the training set:

{V('72bb0a20', imp)}
**Physiological breakdown.** A table of numeric measurements, derived BMI/obesity and key binaries: value and unit, typical adult reference range (display only), status (low/normal/high), and signed contribution to the selected target. Values outside the training range raise a warning but are still scored.

**Plain-language summary.** On request, `POST /api/summary` re-runs the prediction server-side and builds a facts object (percentages, verdicts, top factors, range warnings). A deterministic template always works. If `GROQ_API_KEY` is set, only that facts object is sent to Groq to reword it (temperature 0, 8 s timeout, one retry on rate-limit). The output is validated (disclaimer present, about 120 words, no number absent from the facts, every percentage stated, only listed factors, no advice or diagnostic phrasing); any failure falls back to the template, and the UI labels the source.

## 5. 3D pipeline

`scripts/build_heart_glb.py` turns BodyParts3D 4.0 (DBCLS) into `heart.glb`, driven by `config/anatomy.yaml`.
- **Mapping.** Version 4.0 ships `FJ<n>.obj` files, not FMA-named ones. The script indexes the zip by each file's header and joins to FMA concepts through the parts list. A plain FMA id is included if it resolves; a nested list means "first available alternative". Some ids are composites with no mesh of their own (their children carry the geometry); missing ids are logged, and a target vessel with no geometry fails the build loudly.
- **De-duplication.** Each source file may belong to only one node; the script fails if two nodes claim the same file.
- **Decimation.** Quadric decimation to a per-node triangle budget, then recentring on the heart centroid, scaling to about 2 scene units, and conversion to Y-up.
- **Extras.** Each node carries an `anchor` (a vertex on its surface for the label), a `viewDir` for rotate-to-vessel, and visibility flags.

{V('7e71f45c', tri_t)}
Total {V('7213ed6f', format(tot, ','))} triangles ({V('bb07251b', format(vis, ','))} with the default-hidden veins off), against a build limit of {V('f4c9be98', format(lim_tri, ','))}; the file is {V('c081700f', format(len(b)/1e6, '.2f'))} MB against a {V('08a1bdcd', format(lim_sz/1e6, '.0f'))} MB limit. The build script enforces both.

**Correspondence and colour.** Each target in `features.yaml` maps to exactly one node in `anatomy.yaml` (tested); the frontend receives the node names from `/api/features` and never names a vessel. Colour is the calibrated probability on a green–amber–red scale interpolated in OKLCH; the number is always shown beside it, and the legend marks each target's tuned threshold. Selecting a vessel row or the vessel itself rotates the camera to that node's view direction and fits its bounding box. Overall CAD is bound to the heart body. A label for a vessel behind the heart is dashed and sits beside the silhouette; its tooltip says so.

**No-GPU design.** `frameloop="demand"`, device pixel ratio at most 1.5, no shadows, no Draco decoder, selection by emissive boost, and the post-processing outline dropped when a frame-budget monitor reports slow frames.

## 6. System and architecture

**Backend.** FastAPI with Pydantic v2 models as the API contract. Endpoints: `/api/health`, `/api/features`, `/api/presets`, `/api/predict`, `/api/summary`, `/api/metrics`. The API loads committed artifacts at startup and never trains. Inputs are validated (bounds, non-finite values, missing fields, unknown options) with field-level 422 errors.

**Frontend.** React 19 and TypeScript (strict) with react-three-fiber for the scene. The form is generated from `/api/features`; predictions refresh on a 300 ms debounce with stale requests aborted. TypeScript API types are generated from the Pydantic schema (`make types`), never hand-written.

**Extensibility.** A new clinical feature is a `features.yaml` entry plus `make train`. A new model is a class implementing `RiskModel` plus a registry entry. A new anatomical structure or target is an `anatomy.yaml` entry plus `make assets`.

**Operations and reproducibility.** `make setup | dev | train | assets | types | check | docker`. `make docker` serves the app at http://localhost:8080 (nginx proxying to the API container). Single-request latency through that stack: median 38–45 ms, p95 51–61 ms (50 sequential calls, three runs). Seeds are fixed at {V('d48b9ef9', sp['seed'])}; training is deterministic, and `model_card.json` records the data hash (<code>{V('995b6bef', MC['data_sha256'][:12])}…</code>) and git SHA. The backend test suite collects {V('d3846c3f', n_tests)} tests across {V('d268c932', len(test_files))} files ({V('a332e092', ", ".join(f.removeprefix('test_').removesuffix('.py') for f in test_files))}); the main gates are leakage, SHAP additivity, split stratification and anatomy mapping.

## 7. Usage

1. Run `make docker` and open http://localhost:8080 (or `make setup && make dev` for the development servers on :5173 and :8000).
2. The 3-vessel patient loads first. The presets are {V('5e6bc949', len(PR))} patients taken only from the hold-out set ({V('f8e72321', ", ".join(pre))}), so the model never saw them in training; each shows the actual catheterisation result next to the model estimate. Accordion headers count out-of-range and edited values.
3. Read the right panel top-down: the headline estimate (a button that selects overall CAD), then the vessel table, then the WHY bars for the selected target. The table gives each vessel's plain-language name, estimate, model verdict and, for a preset, the cath result (agrees/misses). Click a row or a vessel in the 3D view to change the selection; hovering a row or a vessel highlights the other. Edit any field and the estimates update live.
4. The Model Performance tab shows CV and hold-out metrics, ROC curves, confusion matrices, calibration and importance. The About tab holds the method and credits.

Colour is never the only signal: each percentage is printed, with a Likely/Unlikely verdict against the tuned threshold. The disclaimer banner is fixed on every tab.

![LCX selected, camera rotated to the vessel](img/lcx-rotated.png)
*Figure 2. Selecting a vessel rotates the heart to it; here LCX, with its label, threshold tick and WHY bars.*

## 8. Limitations and ethics

- **Small, single-centre data.** {V('02567bfe', sp['n_train'] + sp['n_test'])} patients from one hospital; the hold-out has {V('8e1d23bb', sp['n_test'])}. Confidence intervals are wide, and results may not transfer to other populations or devices.
- **Non-imaging inputs only.** The model never sees angiography or CT, so vessel-level estimates are population-pattern estimates, not anatomy. Localising stenosis is harder than detecting CAD: LCX and RCA cross-validated ROC-AUC are {V('7fc7015c', f3(lcx['cv']['tuned']['roc_auc']['mean']))} and {V('113e3ecc', f3(rca['cv']['tuned']['roc_auc']['mean']))}, and their CV Brier scores ({V('2d5a949f', f3(lcx['cv']['tuned']['brier']['mean']))}, {V('b3de3f9a', f3(rca['cv']['tuned']['brier']['mean']))}) improve only modestly on a prevalence-only predictor ({V('0f7607bb', f3(pb(lcx)))} and {V('39991097', f3(pb(rca)))}, from p(1−p) on training prevalence).
- **Noisy thresholds and split sensitivity.** Tuned thresholds move by ±{V('b92be2bd', format(max(T[t]['threshold']['cv_std'] for t in ids), '.2f'))} or more between folds; hold-out AUC for overall CAD ranges from {V('10c473ca', f3(S['targets']['CAD']['roc_auc']['min']))} to {V('5cc0e25d', f3(S['targets']['CAD']['roc_auc']['max']))} across split seeds.
- **Models can disagree.** Overall CAD and each vessel are separate models; the interface notes this when verdicts conflict.
- **Not clinically validated.** No prospective or external validation. The tool is for education and decision support, not a substitute for imaging or clinical judgement, and it gives no treatment advice. The wording throughout is "probability" or "model estimate".
- **Groq data note.** The optional wording feature is off unless a key is configured. When on, the facts object (percentages, verdicts, thresholds, top factors with their entered values, range warnings) is sent to Groq's API; the full input record is not. No key means no external call.

## 9. Credits and licenses

- Dataset: Alizadehsani, R., Roshanzamir, M., & Sani, Z. (2013). *extention of Z-Alizadeh sani dataset*. UCI Machine Learning Repository. https://doi.org/10.24432/C5461K (CC BY 4.0).
- 3D anatomy: "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International". The source OBJ headers still embed CC BY-SA 2.1 Japan, so the derived `heart.glb` is released under CC BY-SA 4.0.
- Code: MIT. Libraries: XGBoost, scikit-learn, pandas, FastAPI, Pydantic, React, three.js and react-three-fiber, Tailwind, shadcn/ui, Recharts, trimesh, fast-simplification.
"""
path = R / "docs/REPORT.md"
MARK = re.compile(r"<!--v:(\w+)-->.*?<!--/v-->", re.S)
if INIT or not path.exists():
    path.write_text(md)
else:
    fresh = {m.group(1): m.group(0) for m in MARK.finditer(md)}
    cur = path.read_text()
    seen = [0]
    def sub(m):
        if m.group(1) in fresh:
            seen[0] += 1
            return fresh[m.group(1)]
        return m.group(0)
    new = MARK.sub(sub, cur)
    stale = sorted({m.group(1) for m in MARK.finditer(new)} - set(fresh))
    empty = [m.group(1) for m in MARK.finditer(new) if not re.sub(r"<!--/?v(:\w+)?-->", "", m.group(0)).strip()]
    if stale or empty:
        sys.exit(f"report_numbers: unfilled markers in docs/REPORT.md: stale={stale} empty={empty}")
    path.write_text(new)
    print(f"refreshed {seen[0]} generated values")
print(len(path.read_text().split()), "words")
