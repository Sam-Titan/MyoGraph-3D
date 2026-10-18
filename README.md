# MyoGraph 3D

[![CI](https://github.com/Sam-Titan/MyoGraph-3D/actions/workflows/ci.yml/badge.svg?branch=v2)](https://github.com/Sam-Titan/MyoGraph-3D/actions/workflows/ci.yml)

MyoGraph 3D turns routine clinical data into an interactive 3D view of coronary artery disease (CAD)
risk. From 49 clinical inputs (demographics, history, symptoms, ECG, labs, echo; BMI and obesity are
derived, giving 55 model columns) it estimates the probability of overall CAD and of significant
stenosis in the LAD, LCX and RCA, then maps each probability onto the matching vessel of a 3D heart,
with a per-feature explanation of why. It is a hackathon research prototype built on the Extension of
the Z-Alizadeh Sani dataset (303 patients).

**Demo video:** <https://youtu.be/UWsbB-3spT4>

> **Disclaimer:** MyoGraph 3D is a research demo, not a medical device. Outputs are model estimates
> of probability learned from a small public dataset and must not be used for clinical decisions.

![Demo: story mode, selecting an artery with its range and waterfall, then pinning a result and comparing after an edit](docs/media/demo.gif)

<sub>18-second demo (also as [MP4](docs/media/demo.mp4)): a guided story, the LAD with its range and waterfall, then pin and compare.</sub>

![Desktop workspace: a 3-vessel hold-out patient with the LAD selected, 3D heart, vessel table and estimates](docs/img/v2-desktop-workspace.jpg)

## Live demo

**<https://myograph-3d.netlify.app/>**

The app is hosted for free: the frontend on Netlify, the API on Render (free tier). The API sleeps when
idle, so the first load can take about a minute while it wakes up. If the first prediction fails, wait a
few seconds and refresh. Deploy config lives in `render.yaml` and `netlify.toml`.

While the API wakes, the page shows the heart in neutral grey with a "Starting the prediction server…" status and
retries by itself (for up to about 2.5 minutes). `.github/workflows/keepalive.yml` pings `/api/health` every 14
minutes to keep it awake. Two limits of GitHub Actions: scheduled workflows run only from the default branch (this
one starts after `v2` is merged into `main`), and GitHub disables them after about 60 days without repository
activity (re-enable under Actions). Runs may also be delayed.

## Features

- **Live predictions:** edit any input and the four calibrated probabilities (overall CAD, LAD, LCX, RCA) update immediately.
- **3D vessel mapping:** each probability is coloured on the heart *and* shown as a number. Selecting a vessel rotates
  the camera to it (the LCX hides behind the heart), fades the others and shades the approximate area it supplies.
  Runs without a GPU; phones get a lighter model and touch picking.
- **Uncertainty ranges:** every estimate has a range from 50 bootstrap-refit models, and a result is marked
  "uncertain" when its range crosses the model's cut-off. The range says how much the estimate depends on the
  training sample, not how likely it is to be right.
- **Plain-language results:** one sentence per estimate, a probability waterfall (baseline to estimate, top factors
  as percentage-point steps), the base rate in the training data, glossary tooltips and per-input help.
- **Story mode:** four short guided stories on real hold-out patients (a low estimate, one artery standing out,
  three arteries, a confidently wrong case). The real result is hidden until the reveal step.
- **Pin and compare:** pin a result, edit the patient, and see `81% → 64% ▼17` on the headline, table and 3D chips,
  with a note when the change is within the model's uncertainty.
- **SHAP "why" panel:** per-feature contributions that sum exactly to the calibrated logit.
- **Physiological breakdown:** each measurement against its reference range, with out-of-range warnings.
- **Plain-language summary:** deterministic template, optionally reworded by Groq when a key is set.
- **Validation and Benchmark tabs:** CV and hold-out metrics, calibration, ROC, stability across 20 random splits, and
  a same-protocol comparison of models and feature sets (see Results).
- **Mobile and print:** bottom navigation and an Edit-patient sheet on phones, a print view, keyboard and
  screen-reader support, automated axe accessibility checks in `make e2e`.
- **Fast first screen:** a committed `snapshot.json` (predictions and ranges for every preset) paints a result
  before a sleeping API has woken up.

| Phone: LAD selected | Phone: story mode | Desktop: LCX, camera rotated |
|---|---|---|
| ![Phone workspace with the LAD selected and 85% headline](docs/img/v2-phone-workspace.jpg) | ![Phone story card explaining the LCX estimate](docs/img/v2-phone-story.jpg) | ![Desktop view with the LCX selected and the camera turned to the left side](docs/img/v2-desktop-lcx.jpg) |

## Setup

There are two routes. **Docker** is the quickest way to run the app. **Local development** is for
changing code. Either way you need a browser with WebGL (any current Chrome, Edge, Firefox or Safari);
no GPU is required; the 3D view runs with software rendering too.

### Requirements

| Tool | Minimum | Install | Docker route | Local dev route |
|---|---|---|---|---|
| Git | any recent | [git-scm.com/downloads](https://git-scm.com/downloads) | yes | yes |
| Docker Desktop (Windows, macOS) or Docker Engine (Linux), with Compose v2 | Compose 2.24 | [Docker Desktop](https://docs.docker.com/desktop/), [Docker Engine](https://docs.docker.com/engine/install/), [Compose](https://docs.docker.com/compose/install/) | yes | no |
| uv | 0.13 (the version the Docker image uses) | [docs.astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) | no | yes |
| Node.js LTS (includes npm) | 20.19 or 22.12+ | [nodejs.org/en/download](https://nodejs.org/en/download) | no | yes |
| make | any | Linux: `sudo apt install build-essential`; macOS: `xcode-select --install` | no | yes (not needed on native Windows, see below) |

You do not install Python yourself: uv reads `backend/.python-version` and installs Python 3.14.4.
The trained models and `frontend/public/models/heart.glb` are committed, so running the app needs no
training and no downloads beyond the dependencies.

### Quick start with Docker (Linux, macOS, Windows)

```bash
git clone https://github.com/Sam-Titan/MyoGraph-3D.git
cd MyoGraph-3D
cp .env.example .env            # optional, only for the Groq summary (see below)
docker compose up --build       # or: make docker
```

Open <http://localhost:8080>. The first build downloads base images and installs dependencies and
takes several minutes; later starts take under a minute. On Windows use `Copy-Item .env.example .env`
in PowerShell instead of `cp`.

### Local development on Linux and macOS

```bash
make setup    # backend (uv sync --extra assets) and frontend (npm install) dependencies
make dev      # API on http://localhost:8010, web on http://localhost:5180
make check    # ruff, biome, pytest and tsc; run before committing
```

Open <http://localhost:5180>. The Vite dev server proxies `/api` to the API on port 8010, so start both
(`make dev` does). `make dev` stops both with Ctrl+C. Ports are fixed so this app does not clash with other
projects; override with `make dev WEB_PORT=... API_PORT=...`.

### Windows, option 1 (recommended): WSL2

1. In an administrator PowerShell run `wsl --install`, then reboot if asked and finish creating the
   Linux user. This installs Ubuntu under WSL2 by default.
2. In Docker Desktop, open Settings, Resources, WSL integration and enable your distribution (only needed
   for the Docker route).
3. Open the Ubuntu terminal and install the tools from the Requirements table inside Linux
   (`sudo apt update && sudo apt install git build-essential curl`, then uv and Node.js from their
   install pages).
4. Clone **inside the Linux home directory** (for example `~/projects`), not under `/mnt/c`. Files under
   `/mnt/c` are served through a slow cross-OS filesystem layer, which makes `npm install`, `uv sync` and
   file watching (hot reload) very slow or unreliable.
5. Follow *Local development on Linux and macOS* above, or the Docker quick start. Browse to
   `http://localhost:5180` (or `:8080`) from Windows as usual.

### Windows, option 2: native PowerShell without make

> **Not tested on Windows; WSL2 or Docker recommended.** The commands below are the ones `make setup`
> and `make dev` run. A dry-run resolution of the backend lockfile for `x86_64-pc-windows-msvc` on
> Python 3.14 found a prebuilt wheel for every backend package (including the optional `assets`
> extra), so no compiler should be needed. If a package ever lacks a Windows wheel, use WSL2 or Docker.

Install uv, Node.js LTS and Git (see the table; make is not needed), then:

```powershell
git clone https://github.com/Sam-Titan/MyoGraph-3D.git
cd MyoGraph-3D

# one-time setup (what `make setup` runs)
cd backend
uv sync --extra assets
cd ..\frontend
npm install
cd ..
```

Then run the API and the web server in two separate PowerShell windows, both from the repo root
(what `make dev` runs):

```powershell
# terminal 1: API on :8010
cd backend
uv run uvicorn app.main:app --reload --port 8010
```

```powershell
# terminal 2: web on :5180 (proxies /api to :8010)
cd frontend
npm run dev
```

Open <http://localhost:5180>. The equivalent of `make check` is `cd backend; uv run ruff check .;
uv run ruff format --check .; uv run pytest` followed by `cd ..\frontend; npm run lint; npm run typecheck`.

### Optional: Groq plain-language summary

The summary is a deterministic template by default and the app is fully usable without a key. To have
Groq reword it, create `.env` at the **repo root** (copy `.env.example`) and set:

```
GROQ_API_KEY=your-key
GROQ_MODEL=            # optional; leave empty for the default
```

Restart the API (`docker compose up -d` again, or restart `make dev`). Only the summary facts
(percentages, ranges, top factors) are sent to Groq. `.env` is git-ignored; never commit it.

### Analytics (optional)

Visitor analytics use PostHog Cloud, cookieless, and are **off unless all three are true**: a production
build, `VITE_POSTHOG_KEY` set, and the page's hostname listed in `VITE_POSTHOG_DOMAINS`. Set these as
build-time environment variables on the frontend host (for example Netlify) and redeploy:

```
VITE_POSTHOG_KEY=phc_...                       # project API key (public by design)
VITE_POSTHOG_HOST=https://us.i.posthog.com     # or https://eu.i.posthog.com for an EU project
VITE_POSTHOG_DOMAINS=your-site.netlify.app     # comma-separated live hostnames
```

In the PostHog project, turn on the cookieless setting (Settings, Web analytics, "Cookieless server hash
mode"); without it cookieless events are ignored. Only page views and a few anonymous actions are sent,
never form values. The API logs one line per request (`access ip=... path=... status=...`) with the visitor
IP taken from Netlify's `x-nf-client-connection-ip` header, never query strings or bodies. Read it in the
Render dashboard under the service's Logs. `TRUST_PROXY_HEADERS` (default `true`) and `LOG_IP_MODE`
(`full` or `truncated`) control this; the headers can be forged, so the IP is for analytics only.

### Environment variables

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `GROQ_API_KEY`, `GROQ_MODEL` | API (`.env` or Render) | unset | Optional wording of the summary; the app works without them |
| `TRUST_PROXY_HEADERS` | API | `true` | Take the visitor IP from Netlify's header for the access log |
| `LOG_IP_MODE` | API | `full` | `full` or `truncated` (zero the last IPv4 octet) |
| `WEB_PORT` / `API_PORT` | `make dev` | 5180 / 8010 | Local dev ports |
| `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `VITE_POSTHOG_DOMAINS` | frontend build (Netlify) | unset | Analytics; off unless all conditions in "Analytics" hold |

**Privacy.** Patient values stay in your browser and are sent only to the prediction API, which does not store
them. Analytics (hosted deployment only) are cookieless PostHog page views and a few anonymous action names;
never form values, probabilities or free text, and query strings and `#` fragments are stripped from URLs. The API
access log records the visitor IP, path, status and timing (never query strings or bodies). Only the summary facts
(percentages, ranges, top factors) go to Groq, and only if you set a key. This is a research demo: do not enter
real patient data.

### Optional and advanced

| Command | What it does |
|---|---|
| `make train` | Prepare data, retrain and regenerate every artifact in `backend/artifacts/`; deterministic (fixed seed 42, single-threaded XGBoost) |
| `make stability` | Re-run the 20-seed split stability study |
| `make assets` | Rebuild `frontend/public/models/heart.glb` from BodyParts3D (needs the download below) |
| `make types` | Regenerate the TypeScript API types from the OpenAPI schema |
| `make fmt` / `make lint` / `make test` | Format / lint / backend tests |
| `make screenshots` | Capture UI screenshots with Playwright; needs `make dev` running and a one-time `cd frontend && npx playwright install chromium` (add `--with-deps` on Linux if system libraries are missing). Filters (default = all): `SHOTS_VIEWS=workspace-default,about` and `SHOTS_VIEWPORTS=390,1440`; unknown names fail with the valid list. The phone overflow / sticky-disclaimer probe runs for any 360/390 width selected |
| `make perf` | No-GPU fps tests (Playwright `no-gpu` project); run when the 3D scene changes; needs `make dev` running |
| `make report` | Refresh the generated numbers in `docs/REPORT.md` and render `docs/REPORT.pdf`; needs `python3` with PyYAML, uv, Node, and the Playwright Chromium above |

`make assets` needs two files from the BodyParts3D 4.0 download page,
<https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html>, placed in `data/raw/bp3d/`
(git-ignored; never commit it):

- `isa_BP3D_4.0_obj_99.zip` (about 143 MB; used in place, no extraction)
- `isa_parts_list_e.txt`

### Troubleshooting

- **Port already in use** (8010, 5180 or 8080). Stop whatever holds the port, or for Docker change the
  left side of `"8080:80"` in `docker-compose.yml`. Find the process with `ss -ltnp | grep :8010`
  (Linux), `lsof -i :8010` (macOS) or `netstat -ano | findstr :8010` (Windows). Vite refuses to move
  (`strictPort`), so pick other ports for both servers: `make dev WEB_PORT=5190 API_PORT=8020` (the
  proxy and the API's CORS list follow these variables). On Windows without make, set `$env:WEB_PORT` /
  `$env:API_PORT` and use the same port in the uvicorn command.
- **Docker is not running / `docker compose` cannot connect.** Start Docker Desktop (or
  `sudo systemctl start docker` on Linux). On Windows with WSL2, enable your distribution under
  Settings, Resources, WSL integration in Docker Desktop and restart the terminal.
- **Slow installs or broken hot reload under `/mnt/c`.** Move the clone into the Linux home directory
  (`~/projects`) and work there.
- **Blank or black 3D view.** Check that WebGL is available (open `chrome://gpu` in Chrome, `edge://gpu` in Edge) and
  that hardware acceleration is enabled in the browser settings; try another browser. The rest of the
  page works without 3D.
- **CRLF line-ending errors** (for example `\r: command not found` or shell scripts failing). The
  repository's `.gitattributes` forces LF, so a fresh clone is correct. If files were checked out with
  CRLF, delete the folder and clone again.

## Architecture

```mermaid
flowchart LR
  subgraph Config
    F[config/features.yaml]
    A[config/anatomy.yaml]
    DS[display.yaml, stories.yaml, uncertainty.yaml]
  end
  D[(Z-Alizadeh Sani CSV)] --> T[ml: preprocess, split, train, calibrate, bootstrap]
  F --> T
  T --> ART[(backend/artifacts)]
  ART --> API["FastAPI /api: predict, intervals, summary, benchmark"]
  F --> API
  A --> API
  DS --> API
  API -->|make snapshot| SNAP[public/snapshot.json]
  BP[BodyParts3D] --> G[build_heart_glb.py] --> GLB[heart.glb, heart.mobile.glb]
  A --> G
  API -->|OpenAPI types| UI[React + three.js]
  SNAP -->|first paint, before the API wakes| UI
  GLB --> UI
  UI -->|Netlify or nginx proxy| API
  KA[GitHub Actions keep-alive, every 14 min] -->|GET /api/health| API
  UI -.->|cookieless events| PH[PostHog]
```

The design is config-driven. `config/features.yaml` is the single source of truth for inputs, groups,
reference ranges and targets; `config/anatomy.yaml` links each target to a mesh in the heart model. The
backend and frontend derive everything from them and from the artifacts, with no hard-coded feature or
vessel lists. Models implement a small `RiskModel` interface (`fit`, `predict_proba`, `explain`,
`save`/`load`) in `backend/ml/models/`.

- **Add a feature:** add an entry to `features.yaml`, run `make train` and `make types`.
- **Add a model:** implement `RiskModel` in `backend/ml/models/`, decorate it with `@register("name")`, and set `MODEL_NAME` in `ml/train.py` and `app/services/predictor.py`.
- **Add an anatomical structure or vessel:** add a target to `features.yaml` and a node with its
  BodyParts3D ids in `anatomy.yaml`, then `make assets`.

## Results

Stratified 80/20 hold-out (seed 42); tuning and cross-validation use the training split only.
Probabilities are calibrated.

| Target | CV ROC-AUC (mean ± std) | Hold-out ROC-AUC | Hold-out Brier |
|---|---|---|---|
| Overall CAD | 0.932 ± 0.030 | 0.824 | 0.174 |
| LAD stenosis | 0.835 ± 0.054 | 0.804 | 0.183 |
| LCX stenosis | 0.729 ± 0.080 | 0.783 | 0.204 |
| RCA stenosis | 0.698 ± 0.058 | 0.695 | 0.205 |

Cross-validation is 5-fold repeated 3 times on the training split. Across 20 random splits the seed-42
split is the hardest for overall CAD (hold-out ROC-AUC 0.824 against a median of 0.911), so the hold-out
number is a conservative estimate.

**Benchmark (Benchmark tab, `make benchmark`).** Logistic regression, random forest and XGBoost (the production
model) were compared under one protocol (5x3 repeated stratified CV on the training split, Platt scaling, paired
Nadeau-Bengio corrected tests, Holm-Bonferroni within each family), and XGBoost was refit without the ECG and/or
echocardiography feature groups. After the corrections **no model and no feature set is clearly better** than
XGBoost with all features: none of the 24 model comparisons is clear, and 1 of 36 ablation comparisons is (dropping
both ECG and echo worsens the LAD Brier score by about 0.024). With 303 patients the differences are mostly within
noise, so XGBoost was kept, not because it won. TabPFN is supported offline but was skipped (not installed).

![Benchmark tab: model comparison and feature-group ablation with corrected paired differences](docs/img/v2-desktop-benchmark.jpg)

**Serving throughput** (`scripts/load_test.py`, laptop, WSL2 Docker, 500 `POST /api/predict` at 20 concurrent,
0 errors): about **59 predictions/s** at 20 concurrent, with 0 errors. The 340 ms median / 462 ms p95 latency
reported under that load is queueing, not per-request cost: by Little's law, 20 in flight / 59 req/s is about
0.34 s. A single request on an otherwise idle Docker stack (50 sequential calls after warm-up, three runs) took a median of 38–45 ms and a p95 of 51–61 ms. With the 300 ms input debounce, one
person editing the form sends at most about 3 requests/s.

## Limitations

- 303 patients from a single centre; no external validation, so results may not transfer.
- Per-vessel targets are weaker than overall CAD (see the table), and the hold-out set is small (61 rows).
- Labels are angiographic stenosis; the model estimates probability and is not a diagnostic tool.
- The 3D heart is a schematic anatomical model, not patient-specific imaging.
- Inputs outside the training range are flagged but still scored.

## Credits and licenses

- **Dataset:** Alizadehsani, R., Roshanzamir, M., & Sani, Z. (2013). *Extension of Z-Alizadeh Sani
  dataset* [Dataset]. UCI Machine Learning Repository. <https://doi.org/10.24432/C5461K>. CC BY 4.0.
- **3D anatomy:** BodyParts3D, © The Database Center for Life Science, licensed under CC Attribution 4.0
  International. The derived `frontend/public/models/heart.glb` is released under
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); see
  `frontend/public/models/LICENSE-ASSETS.md`.
- **Code:** MIT (see `LICENSE`).
