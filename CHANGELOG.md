# Changelog

## v2.1.0

UI polish and the v2.0.1 audit fixes. No model, API or data changes.

### Changed
- **3D toolbar** is one row at every width: icon-only buttons from 1280 px so it fits without arrows; below that it is a
  scroll-snap carousel with ‹ › arrows (only when it overflows), fade edges and no scrollbar.
- **Legend** can be hidden (remembered in localStorage). The hidden line keeps "Colour = estimated probability" and the
  live numbers for every target.
- **Tab row** never shows a scrollbar (a 1 px underline overflow forced a vertical one on classic-scrollbar browsers).

### Fixed
- Story keys: Escape and arrows inside popovers, selects and dialogs no longer exit or move the story.
- Leaving a story restores the previous tab and pin.
- The Pin button reads "Waiting for ranges…" while ranges load.

## v2.0.0

Everything since the hackathon submission (v1.0.0). The model, features, targets and hold-out split are unchanged;
v2 makes the results easier to read, adds uncertainty, and hardens the deployment.

### Added
- **Uncertainty ranges** from 50 bootstrap-refit models per target (`config/uncertainty.yaml`, `POST /api/intervals`),
  a per-target cut-off label ("above / below the model's cut-off", "uncertain" when the range crosses it).
- **Plain-language results** (`config/display.yaml`, `GET /api/display`): outcome sentences, a probability waterfall
  from the calibrated SHAP values, base-rate note, dot picture, glossary tooltips, per-input help text.
- **Story mode:** four guided stories on hold-out patients (`config/stories.yaml`, `GET /api/stories`).
- **Pin and compare** on the headline, vessel table and 3D chips.
- **Benchmark tab** (`make benchmark`, `GET /api/benchmark`): logistic regression, random forest and XGBoost under one
  protocol, plus an ECG/echo feature-group ablation, with Nadeau-Bengio corrected paired tests and Holm-Bonferroni
  adjustment. Result: no model or feature set is clearly better than XGBoost with all features.
- **3D scene v2:** thicker arteries, outlines, focus mode, supply-region shading, name chips with leader lines,
  view presets, vessel key, a lighter `heart.mobile.glb`, no-GPU path.
- **Mobile:** bottom navigation, sticky collapsible heart, Edit-patient sheet, touch picking, stacked tables.
- **Cold-start handling:** `snapshot.json` first paint, wake status with retries, lazy tabs and deferred three.js,
  GitHub Actions keep-alive (`.github/workflows/keepalive.yml`, runs from `main`).
- **Visitor analytics** (PostHog, cookieless, opt-in by environment) and an **access log** with the real client IP
  (`TRUST_PROXY_HEADERS`, `LOG_IP_MODE`).
- Intro strip, social preview image and icons, print summary, axe accessibility checks.
- **CI** (`.github/workflows/ci.yml`: `make check` on push and PR to `main` and `v2`), demo GIF and MP4.

### Changed
- Phone headline uses plain words ("Probability of coronary artery disease"; `compact_labels` in `display.yaml`).
- Summary retries a 503 while the bootstrap models load; the API starts serving `/api/predict` before they are ready.
- Visible text says "cut-off", not "threshold".

### Removed
- `@react-three/postprocessing` (outlines now use drei `<Outlines>`).

## v1.0.0

Hackathon submission: calibrated XGBoost models for overall CAD and LAD/LCX/RCA stenosis, SHAP explanations, an
interactive 3D heart, validation tab, optional Groq summary, Docker and Netlify/Render deployment, and the report
(`docs/REPORT.pdf`).
