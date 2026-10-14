"""Print the README results table (Markdown) from backend/artifacts/metrics.json."""

import json
import sys
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / "backend" / "artifacts" / "metrics.json"


def table(metrics: dict) -> str:
    rows = [
        "| Target | CV ROC-AUC (mean ± std) | Hold-out ROC-AUC | Hold-out Brier |",
        "|---|---|---|---|",
    ]
    for t in metrics["targets"].values():
        cv = t["cv"]["default"]["roc_auc"]
        test = t["test"]["default"]
        rows.append(
            f"| {t['label']} | {cv['mean']:.3f} ± {cv['std']:.3f} "
            f"| {test['roc_auc']:.3f} | {test['brier']:.3f} |"
        )
    return "\n".join(rows)


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else PATH
    print(table(json.loads(path.read_text())))
