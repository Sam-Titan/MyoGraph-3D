"""Write the data-side artifacts: `split.json` and `feature_stats.json` (train rows only).

Run with `make prepare`. Phase 2's `make train` depends on this target.
"""

import logging

from ml.preprocess import inputs_to_matrix, load_raw, raw_to_inputs
from ml.schema import load_schema
from ml.split import SPLIT_PATH, make_split, write_split
from ml.stats import STATS_PATH, compute_feature_stats, write_feature_stats

log = logging.getLogger(__name__)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    schema = load_schema()
    df = load_raw(schema=schema)
    split = make_split(df, schema)
    write_split(split)

    train = df.iloc[split.train_idx]
    inputs = raw_to_inputs(train, schema)
    stats = compute_feature_stats(inputs, inputs_to_matrix(inputs, schema), schema)
    write_feature_stats(stats)
    log.info("split: %d train / %d test -> %s", split.n_train, split.n_test, SPLIT_PATH)
    log.info("feature stats: %d inputs (train only) -> %s", len(stats), STATS_PATH)


if __name__ == "__main__":
    main()
