"""Load test for POST /api/predict: N requests at a fixed concurrency; prints median/p95 latency.

Usage: uv run --project backend python scripts/load_test.py [BASE_URL] [REQUESTS] [CONCURRENCY]
"""

import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
N = int(sys.argv[2]) if len(sys.argv) > 2 else 500
CONC = int(sys.argv[3]) if len(sys.argv) > 3 else 20


def main() -> None:
    presets = httpx.get(f"{BASE}/api/presets", timeout=10).json()
    presets = presets["presets"] if isinstance(presets, dict) else presets
    bodies = [{"values": p["values"]} for p in presets]

    def one(i: int) -> tuple[float, int]:
        t = time.perf_counter()
        r = client.post(f"{BASE}/api/predict", json=bodies[i % len(bodies)])
        return (time.perf_counter() - t) * 1000, r.status_code

    with httpx.Client(timeout=30, limits=httpx.Limits(max_connections=CONC)) as client:
        t0 = time.perf_counter()
        with ThreadPoolExecutor(CONC) as ex:
            res = list(ex.map(one, range(N)))
        wall = time.perf_counter() - t0
    lat = sorted(r[0] for r in res)
    bad = sum(1 for r in res if r[1] != 200)
    p95 = lat[int(0.95 * len(lat)) - 1]
    print(f"requests={N} concurrency={CONC} errors={bad} wall={wall:.1f}s rps={N / wall:.0f}")
    print(f"median={statistics.median(lat):.0f} ms  p95={p95:.0f} ms  max={lat[-1]:.0f} ms")


if __name__ == "__main__":
    main()
