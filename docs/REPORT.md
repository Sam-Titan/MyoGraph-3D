# MyoGraph 3D: coronary artery disease probabilities on an interactive 3D heart

*Track A, Multimodal AI Hackathon 2026: Cardiovascular Risk Visualization & Prediction.*

Swayam Bansal  
Repository: <!--v:c0de5afe-->https://github.com/Sam-Titan/MyoGraph-3D<!--/v-->  
Demo video: https://youtu.be/UWsbB-3spT4

*Model version <code><!--v:784a6c5e-->xgb-v1-b60472ec<!--/v--></code>, trained <!--v:9e5b60cb-->2026-10-13<!--/v-->. Generated values come from the committed artifacts via `scripts/report_numbers.py`.*

## 1. Problem and approach

Track A asks for a system that predicts cardiovascular risk and makes it visible. MyoGraph 3D takes a patient's clinical record (demographics, history, examination, ECG, laboratory values, echocardiography) and returns model estimates of the probability of overall coronary artery disease (CAD) and of stenosis in each of <!--v:b8365ee1-->3<!--/v--> coronary arteries (<!--v:a1ea9bb9-->LAD, LCX, RCA<!--/v-->). Those probabilities are painted live onto a 3D heart, so the user sees which vessel the model considers most likely to be narrowed, and the number next to it.

Three ideas shape the design. First, honest validation: a fixed hold-out, repeated cross-validation on the training part only, and a split-stability analysis that shows how much one lucky or unlucky split can move a score. Second, calibrated, explainable output: every probability is calibrated and decomposes exactly into per-input contributions. Third, one source of truth: the feature schema and the target-to-mesh map live in two YAML files, and the backend, API, form and 3D scene all derive from them.

![MyoGraph 3D workspace](img/workspace-3vessel.png)
*Figure 1. Patient workspace with a three-vessel hold-out preset (`docs/img/workspace-3vessel.png`).*

## 2. Data and preprocessing

**Dataset.** UCI *Extension of Z-Alizadeh Sani* (Alizadehsani, Roshanzamir & Sani, 2013; CC BY 4.0; doi:10.24432/C5461K): <!--v:02567bfe-->303<!--/v--> patients, one row each, no missing values. Targets are overall CAD (catheterisation label) and stenosis of <!--v:a1ea9bb9-->LAD, LCX, RCA<!--/v-->. Positive rates in the training split: <!--v:392a8ee4-->CAD 71%, LAD 59%, LCX 38%, RCA 38%<!--/v-->.

**Quirks handled in `config/features.yaml`.**
- `Sex` contains the typo `Fmale`, mapped to female.
- Binary columns mix `Y`/`N` and `1`/`0`; each feature lists the raw values that mean yes.
- `VHD` has a lowercase `mild`; it becomes an ordinal 0–3.
- <!--v:41d368a5-->Exertional CP<!--/v--> is constant and dropped.
- `BMI` and `Obesity` are derived from weight and height, server-side, and recomputed for training as well, so training and serving share one code path (this overrides one inconsistent `Obesity` row).
- Composites: smoking status and chest-pain type are mutually exclusive in the data, so each is one input that expands into several dataset columns; `BBB` is one-hot encoded.

**Leakage exclusion.** <!--v:2afdc52a-->`Cath`, `LAD`, `LCX`, `RCA`<!--/v--> are never model inputs for any target, including the other vessels when predicting one vessel. A test (`test_leakage.py`) enforces this from the schema.

**Schema-driven.** The schema holds <!--v:f03de691-->51<!--/v--> features: <!--v:0a9b9168-->22 number, 3 category, 2 derived, 22 binary, 2 composite<!--/v-->. The client sends <!--v:205802c8-->49<!--/v--> inputs (derived fields are ignored if sent). No feature or vessel list is hard-coded in Python or TypeScript.

## 3. Model and validation

**Model.** One `XGBClassifier` per target behind a common `RiskModel` interface: <!--v:cfe725fb-->300<!--/v--> trees, depth <!--v:a96d79f5-->3<!--/v-->, learning rate <!--v:7f74c2e7-->0.05<!--/v-->, subsample <!--v:5ffef6f7-->0.8<!--/v-->, column sample <!--v:ef252d87-->0.8<!--/v-->, `min_child_weight` <!--v:c5798654-->2<!--/v-->, L2 <!--v:56a66a64-->1.0<!--/v-->, and `scale_pos_weight` set per target to negatives/positives. No hyper-parameter search was run.

**Protocol.**
1. Stratified <!--v:62e1df95-->20<!--/v-->% hold-out (seed <!--v:d48b9ef9-->42<!--/v-->), stratified on the number of stenotic vessels (0–<!--v:b8365ee1-->3<!--/v-->) so all four targets stay balanced: <!--v:20b77c54-->242<!--/v--> train, <!--v:8e1d23bb-->61<!--/v--> test.
2. Development metrics: <!--v:60f98b3a-->5<!--/v-->-fold stratified CV repeated <!--v:da9de890-->3<!--/v--> times (seed <!--v:0c04690c-->42<!--/v-->) on the training set only. The hold-out is a final sanity check; it is never used for tuning or for CV.
3. Calibration: out-of-fold raw margins on train, then Platt scaling `logit = a·margin + b`; the final model is refit on all training rows. The served probability is `sigmoid(a·margin + b)`.
<!--v:912b498a-->

| Target | a (slope) | b (intercept) |
|---|---|---|
| CAD | 0.926 | 0.513 |
| LAD | 0.656 | 0.261 |
| LCX | 0.537 | -0.162 |
| RCA | 0.358 | -0.271 |

<!--/v-->
4. Decision thresholds: Youden's J maximiser on the training out-of-fold calibrated probabilities (never the hold-out). Inside each CV fold the threshold comes from that fold's own training predictions, so CV stays honest.

**Results.** CV is the primary figure (mean ± std over <!--v:147bfeaf-->15<!--/v--> folds); the hold-out has n = <!--v:8e1d23bb-->61<!--/v--> and is noisy.

<!--v:9b207167-->

| Target | Prevalence (train / test) | ROC-AUC CV | ROC-AUC hold-out | Brier CV | Brier hold-out |
|---|---|---|---|---|---|
| Overall CAD | 71% / 72% | 0.932 ± 0.030 | 0.824 | 0.085 ± 0.016 | 0.174 |
| LAD stenosis | 59% / 56% | 0.835 ± 0.054 | 0.804 | 0.161 ± 0.022 | 0.183 |
| LCX stenosis | 38% / 44% | 0.729 ± 0.080 | 0.783 | 0.203 ± 0.022 | 0.204 |
| RCA stenosis | 38% / 36% | 0.698 ± 0.058 | 0.695 | 0.216 ± 0.011 | 0.205 |

<!--/v-->
Brier scores do not depend on the threshold. Threshold-dependent metrics at the tuned thresholds:

<!--v:bb629dea-->

| Target | Tuned threshold | CV spread of threshold | Recall CV | Recall hold-out | F1 CV | F1 hold-out | F1 hold-out at 0.5 |
|---|---|---|---|---|---|---|---|
| Overall CAD | 0.477 | 0.637 ± 0.068 | 0.904 ± 0.071 | 0.773 | 0.914 ± 0.034 | 0.810 | 0.810 |
| LAD stenosis | 0.535 | 0.510 ± 0.078 | 0.834 ± 0.140 | 0.824 | 0.795 ± 0.072 | 0.789 | 0.800 |
| LCX stenosis | 0.395 | 0.380 ± 0.049 | 0.690 ± 0.120 | 0.630 | 0.607 ± 0.064 | 0.654 | 0.522 |
| RCA stenosis | 0.462 | 0.349 ± 0.044 | 0.735 ± 0.128 | 0.500 | 0.588 ± 0.060 | 0.564 | 0.400 |

<!--/v-->
Youden thresholds are noisy at this sample size: the spread across CV folds is shown above, and the tuned value can lower or raise F1 relative to 0.5 (last column). Prevalence matters for reading these numbers: a constant predictor of the majority class would reach accuracy <!--v:bff2710f-->72%<!--/v--> on overall CAD in the hold-out, so Brier and ROC-AUC are the more informative figures.

**Split stability.** The hold-out ROC-AUC and Brier were recomputed over <!--v:e1978be2-->21<!--/v--> splits (the official seed plus seeds 0–<!--v:5e51baeb-->19<!--/v-->; same stratification, same model seed). Seed <!--v:de5b8f63-->42<!--/v--> is the <!--v:52c34228-->hardest<!--/v--> split for overall CAD: its AUC is the lowest of the <!--v:e1978be2-->21<!--/v--> splits, and its Brier score is at percentile <!--v:d293b3bc-->100<!--/v--> (the worst).

<!--v:627fcdb6-->

| Target | Seed-42 AUC | Median | IQR | Min – max | Seed-42 percentile |
|---|---|---|---|---|---|
| Overall CAD | 0.824 | 0.911 | 0.874 – 0.924 | 0.836 – 0.969 | 0 |
| LAD stenosis | 0.804 | 0.810 | 0.794 – 0.861 | 0.756 – 0.931 | 35 |
| LCX stenosis | 0.783 | 0.772 | 0.720 – 0.791 | 0.642 – 0.807 | 60 |
| RCA stenosis | 0.695 | 0.681 | 0.656 – 0.729 | 0.588 – 0.773 | 65 |

<!--/v-->
The headline hold-out CAD AUC (<!--v:6f80ea39-->0.824<!--/v-->) is therefore a pessimistic draw; the median over seeds is <!--v:d9140f46-->0.911<!--/v-->. We kept seed <!--v:de5b8f63-->42<!--/v--> as the official split because it was fixed before the stability analysis, and report the spread instead of choosing a friendlier seed.

## 4. Interpretability

**TreeSHAP in calibrated log-odds.** At serve time the app uses XGBoost's native `pred_contribs`, which gives exact TreeSHAP contributions in margin space. They are scaled by the calibration slope `a`, and the bias becomes `a·bias + b`. Contributions plus base value therefore sum exactly to the calibrated logit, which `test_explain_additivity.py` verifies.

**WHY panel.** For the selected target, the top 10 inputs are shown as diverging bars (red raises the estimate, teal lowers it) in log-odds, with the header "average patient (model baseline) → this patient". Global importance on the training set:

<!--v:72bb0a20-->

| Target | Top-3 inputs by mean \|SHAP\| (log-odds) |
|---|---|
| CAD | Chest pain type (1.49), Age (0.70), Ejection fraction (TTE) (0.59) |
| LAD | Chest pain type (0.68), Ejection fraction (TTE) (0.49), Age (0.44) |
| LCX | Age (0.42), Triglycerides (0.30), Chest pain type (0.29) |
| RCA | Chest pain type (0.21), Age (0.21), Diabetes mellitus (0.19) |

<!--/v-->
**Physiological breakdown.** A table of numeric measurements, derived BMI/obesity and key binaries: value and unit, typical adult reference range (display only), status (low/normal/high), and signed contribution to the selected target. Values outside the training range raise a warning but are still scored.

**Plain-language summary.** On request, `POST /api/summary` re-runs the prediction server-side and builds a facts object (percentages, verdicts, top factors, range warnings). A deterministic template always works. If `GROQ_API_KEY` is set, only that facts object is sent to Groq to reword it (temperature 0, 8 s timeout, one retry on rate-limit). The output is validated (disclaimer present, about 120 words, no number absent from the facts, every percentage stated, only listed factors, no advice or diagnostic phrasing); any failure falls back to the template, and the UI labels the source.

## 5. 3D pipeline

`scripts/build_heart_glb.py` turns BodyParts3D 4.0 (DBCLS) into `heart.glb`, driven by `config/anatomy.yaml`.
- **Mapping.** Version 4.0 ships `FJ<n>.obj` files, not FMA-named ones. The script indexes the zip by each file's header and joins to FMA concepts through the parts list. A plain FMA id is included if it resolves; a nested list means "first available alternative". Some ids are composites with no mesh of their own (their children carry the geometry); missing ids are logged, and a target vessel with no geometry fails the build loudly.
- **De-duplication.** Each source file may belong to only one node; the script fails if two nodes claim the same file.
- **Decimation.** Quadric decimation to a per-node triangle budget, then recentring on the heart centroid, scaling to about 2 scene units, and conversion to Y-up.
- **Extras.** Each node carries an `anchor` (a vertex on its surface for the label), a `viewDir` for rotate-to-vessel, and visibility flags.

<!--v:7e71f45c-->

| Node | Triangles | Budget | Note |
|---|---|---|---|
| LAD | 8000 | 8000 |  |
| LCX | 3018 | 8000 |  |
| RCA | 10000 | 10000 |  |
| LM | 204 | 2000 |  |
| heart | 40000 | 40000 |  |
| aorta | 396 | 6000 | optional |
| veins | 6000 | 6000 | hidden by default |

<!--/v-->
Total <!--v:7213ed6f-->67,618<!--/v--> triangles (<!--v:bb07251b-->61,618<!--/v--> with the default-hidden veins off), against a build limit of <!--v:f4c9be98-->80,000<!--/v-->; the file is <!--v:c081700f-->1.27<!--/v--> MB against a <!--v:08a1bdcd-->3<!--/v--> MB limit. The build script enforces both.

**Correspondence and colour.** Each target in `features.yaml` maps to exactly one node in `anatomy.yaml` (tested); the frontend receives the node names from `/api/features` and never names a vessel. Colour is the calibrated probability on a green–amber–red scale interpolated in OKLCH; the number is always shown beside it, and the legend marks each target's tuned threshold. Selecting a vessel row or the vessel itself rotates the camera to that node's view direction and fits its bounding box. Overall CAD is bound to the heart body. A label for a vessel behind the heart is dashed and sits beside the silhouette; its tooltip says so.

**No-GPU design.** `frameloop="demand"`, device pixel ratio at most 1.5, no shadows, no Draco decoder, selection by emissive boost, and the post-processing outline dropped when a frame-budget monitor reports slow frames.

## 6. System and architecture

**Backend.** FastAPI with Pydantic v2 models as the API contract. Endpoints: `/api/health`, `/api/features`, `/api/presets`, `/api/predict`, `/api/summary`, `/api/metrics`. The API loads committed artifacts at startup and never trains. Inputs are validated (bounds, non-finite values, missing fields, unknown options) with field-level 422 errors.

**Frontend.** React 19 and TypeScript (strict) with react-three-fiber for the scene. The form is generated from `/api/features`; predictions refresh on a 300 ms debounce with stale requests aborted. TypeScript API types are generated from the Pydantic schema (`make types`), never hand-written.

**Extensibility.** A new clinical feature is a `features.yaml` entry plus `make train`. A new model is a class implementing `RiskModel` plus a registry entry. A new anatomical structure or target is an `anatomy.yaml` entry plus `make assets`.

**Operations and reproducibility.** `make setup | dev | train | assets | types | check | docker`. `make docker` serves the app at http://localhost:8080 (nginx proxying to the API container). Single-request latency through that stack: median 38–45 ms, p95 51–61 ms (50 sequential calls, three runs). Seeds are fixed at <!--v:d48b9ef9-->42<!--/v-->; training is deterministic, and `model_card.json` records the data hash (<code><!--v:995b6bef-->b60472ecebdd<!--/v-->…</code>) and git SHA. The backend test suite collects <!--v:d3846c3f-->63<!--/v--> tests across <!--v:d268c932-->9<!--/v--> files (<!--v:a332e092-->anatomy, api, explain_additivity, health, leakage, preprocess, presets, split, summary<!--/v-->); the main gates are leakage, SHAP additivity, split stratification and anatomy mapping.

## 7. Usage

1. Run `make docker` and open http://localhost:8080 (or `make setup && make dev` for the development servers on :5173 and :8000).
2. The 3-vessel patient loads first. The presets are <!--v:5e6bc949-->6<!--/v--> patients taken only from the hold-out set (<!--v:f8e72321-->no-cad, lad-only, lcx-rca-only, 2-vessel, 3-vessel, hard-case<!--/v-->), so the model never saw them in training; each shows the actual catheterisation result next to the model estimate. Accordion headers count out-of-range and edited values.
3. Read the right panel top-down: the headline estimate (a button that selects overall CAD), then the vessel table, then the WHY bars for the selected target. The table gives each vessel's plain-language name, estimate, model verdict and, for a preset, the cath result (agrees/misses). Click a row or a vessel in the 3D view to change the selection; hovering a row or a vessel highlights the other. Edit any field and the estimates update live.
4. The Model performance tab shows CV and hold-out metrics, ROC curves, confusion matrices, calibration and importance. The About tab holds the method and credits.

Colour is never the only signal: each percentage is printed, with a Likely/Unlikely verdict against the tuned threshold. The disclaimer banner is fixed on every tab.

![LCX selected, camera rotated to the vessel](img/lcx-rotated.png)
*Figure 2. Selecting a vessel rotates the heart to it; here LCX, with its label, threshold tick and WHY bars.*

## 8. Limitations and ethics

- **Small, single-centre data.** <!--v:02567bfe-->303<!--/v--> patients from one hospital; the hold-out has <!--v:8e1d23bb-->61<!--/v-->. Confidence intervals are wide, and results may not transfer to other populations or devices.
- **Non-imaging inputs only.** The model never sees angiography or CT, so vessel-level estimates are population-pattern estimates, not anatomy. Localising stenosis is harder than detecting CAD: LCX and RCA cross-validated ROC-AUC are <!--v:7fc7015c-->0.729<!--/v--> and <!--v:113e3ecc-->0.698<!--/v-->, and their CV Brier scores (<!--v:2d5a949f-->0.203<!--/v-->, <!--v:b3de3f9a-->0.216<!--/v-->) improve only modestly on a prevalence-only predictor (<!--v:0f7607bb-->0.236<!--/v--> and <!--v:39991097-->0.236<!--/v-->, from p(1−p) on training prevalence).
- **Noisy thresholds and split sensitivity.** Tuned thresholds move by ±<!--v:b92be2bd-->0.08<!--/v--> or more between folds; hold-out AUC for overall CAD ranges from <!--v:10c473ca-->0.836<!--/v--> to <!--v:5cc0e25d-->0.969<!--/v--> across split seeds.
- **Models can disagree.** Overall CAD and each vessel are separate models; the interface notes this when verdicts conflict.
- **Not clinically validated.** No prospective or external validation. The tool is for education and decision support, not a substitute for imaging or clinical judgement, and it gives no treatment advice. The wording throughout is "probability" or "model estimate".
- **Groq data note.** The optional wording feature is off unless a key is configured. When on, the facts object (percentages, verdicts, thresholds, top factors with their entered values, range warnings) is sent to Groq's API; the full input record is not. No key means no external call.

## 9. Credits and licenses

- Dataset: Alizadehsani, R., Roshanzamir, M., & Sani, Z. (2013). *extention of Z-Alizadeh sani dataset*. UCI Machine Learning Repository. https://doi.org/10.24432/C5461K (CC BY 4.0).
- 3D anatomy: "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International". The source OBJ headers still embed CC BY-SA 2.1 Japan, so the derived `heart.glb` is released under CC BY-SA 4.0.
- Code: MIT. Libraries: XGBoost, scikit-learn, pandas, FastAPI, Pydantic, React, three.js and react-three-fiber, Tailwind, shadcn/ui, Recharts, trimesh, fast-simplification.
