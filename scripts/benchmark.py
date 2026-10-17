"""`make benchmark`: write backend/artifacts/benchmark.json (run from backend/ via uv)."""

import logging
import time

from ml.artifacts import write_json
from ml.benchmark import run_benchmark
from ml.benchmark_config import load_benchmark


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    started = time.perf_counter()
    report = run_benchmark(load_benchmark())
    write_json("benchmark.json", report)
    logging.info("benchmark.json written in %.0f s", time.perf_counter() - started)


if __name__ == "__main__":
    main()
