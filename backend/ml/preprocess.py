"""Raw dataset rows and API input dicts -> the same model matrix, through one encoder.

    raw dataframe --raw_to_inputs--> canonical input dicts --inputs_to_matrix--> model matrix
    API request values ------------------------------------^

Training and serving therefore cannot drift: only `inputs_to_matrix` knows how to encode.
"""

import ast
import operator
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any

import pandas as pd

from app.core.config import REPO_ROOT
from ml.schema import (
    BinaryFeature,
    CategoryFeature,
    CompositeFeature,
    DerivedFeature,
    FeatureSchema,
    NumberFeature,
    OneHotEncoding,
    OrdinalEncoding,
    composite_columns,
    load_schema,
)

RAW_CSV = REPO_ROOT / "data" / "raw" / "z_alizadeh_sani_ext.csv"

InputValue = float | int | str
_NEGATIVES = {"N", "0"}
_BINOPS: dict[type, Callable[[Any, Any], Any]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
}
_CMPOPS: dict[type, Callable[[Any, Any], bool]] = {
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
}


def load_raw(path: Path = RAW_CSV, schema: FeatureSchema | None = None) -> pd.DataFrame:
    """Read the dataset, check every column the schema needs is there, drop dropped columns."""
    schema = schema or load_schema()
    df = pd.read_csv(path)
    needed = {t.column for t in schema.targets.values()} | schema.source_columns()
    if missing := needed - set(df.columns):
        raise ValueError(f"dataset is missing columns: {sorted(missing)}")
    return df.drop(columns=[d.column for d in schema.dropped if d.column in df.columns])


def raw_targets(df: pd.DataFrame, schema: FeatureSchema | None = None) -> pd.DataFrame:
    """0/1 label per target id. Never part of the model matrix."""
    schema = schema or load_schema()
    return pd.DataFrame(
        {k: (df[t.column] == t.positive).astype(int) for k, t in schema.targets.items()}
    )


def _same(a: object, b: object) -> bool:
    return str(a).strip() == str(b).strip()


def _raw_row_to_inputs(row: Mapping[str, Any], schema: FeatureSchema) -> dict[str, InputValue]:
    out: dict[str, InputValue] = {}
    for f in schema.api_inputs:
        if isinstance(f, NumberFeature):
            out[f.id] = float(row[f.column])
        elif isinstance(f, BinaryFeature):
            raw = str(row[f.column]).strip()
            if raw in {str(s) for s in f.source}:
                out[f.id] = 1
            elif raw in _NEGATIVES:
                out[f.id] = 0
            else:
                raise ValueError(f"{f.column}: unexpected value {raw!r}")
        elif isinstance(f, CategoryFeature):
            match = [o.value for o in f.options if _same(o.source, row[f.column])]
            if len(match) != 1:
                raise ValueError(f"{f.column}: unexpected value {row[f.column]!r}")
            out[f.id] = match[0]
        elif isinstance(f, CompositeFeature):
            match = [
                o.value
                for o in f.options
                if all(_same(v, row[c]) for c, v in (o.sets or {}).items())
            ]
            if len(match) != 1:
                cols = {c: row[c] for c in composite_columns(f)}
                raise ValueError(f"{f.id}: no unique option matches {cols}")
            out[f.id] = match[0]
    return out


def raw_to_inputs(
    df: pd.DataFrame, schema: FeatureSchema | None = None
) -> list[dict[str, InputValue]]:
    """Decode dataset rows into canonical API inputs (derived fields excluded)."""
    schema = schema or load_schema()
    return [_raw_row_to_inputs(r, schema) for r in df.to_dict(orient="records")]


def _eval_formula(expr: str, env: Mapping[str, float]) -> float:
    """Evaluate a derived-feature formula (arithmetic + one comparison) without `eval`."""

    def walk(n: ast.AST) -> Any:
        if isinstance(n, ast.Expression):
            return walk(n.body)
        if isinstance(n, ast.Constant) and isinstance(n.value, int | float):
            return n.value
        if isinstance(n, ast.Name):
            return env[n.id]
        if isinstance(n, ast.BinOp) and type(n.op) in _BINOPS:
            return _BINOPS[type(n.op)](walk(n.left), walk(n.right))
        if isinstance(n, ast.Compare) and len(n.ops) == 1 and type(n.ops[0]) in _CMPOPS:
            return _CMPOPS[type(n.ops[0])](walk(n.left), walk(n.comparators[0]))
        raise ValueError(f"unsupported formula element in {expr!r}")

    return walk(ast.parse(expr.replace("^", "**"), mode="eval"))


def _num(v: object) -> float:
    """Composite `sets` values are 0/1 or the dataset's Y/N."""
    if isinstance(v, str) and v in ("Y", "N"):
        return 1.0 if v == "Y" else 0.0
    return float(v)  # type: ignore[arg-type]


def _encode_row(inp: Mapping[str, InputValue], schema: FeatureSchema) -> dict[str, float]:
    if missing := [f.id for f in schema.api_inputs if f.id not in inp]:
        raise ValueError(f"missing inputs: {missing}")
    out: dict[str, float] = {}
    env: dict[str, float] = {}
    for f in schema.features:
        if isinstance(f, NumberFeature):
            out[f.id] = env[f.id] = float(inp[f.id])
        elif isinstance(f, BinaryFeature):
            out[f.id] = env[f.id] = 1.0 if float(inp[f.id]) else 0.0
        elif isinstance(f, DerivedFeature):
            val = float(_eval_formula(f.formula, env))
            out[f.id] = env[f.id] = val
        elif isinstance(f, CategoryFeature):
            value = inp[f.id]
            if value not in {o.value for o in f.options}:
                raise ValueError(f"{f.id}: unknown option {value!r}")
            enc = f.encoding
            if isinstance(enc, OneHotEncoding):
                kept = [o.value for o in f.options if o.value != enc.drop]
                out.update(
                    {c: float(value == v) for c, v in zip(enc.model_columns, kept, strict=True)}
                )
            elif isinstance(enc, OrdinalEncoding):
                out[enc.model_column] = float(enc.order.index(str(value)))
            else:
                out[enc.model_column] = float(value == enc.positive)
        elif isinstance(f, CompositeFeature):
            chosen = [o for o in f.options if o.value == inp[f.id]]
            if len(chosen) != 1:
                raise ValueError(f"{f.id}: unknown option {inp[f.id]!r}")
            out.update({c: _num(v) for c, v in (chosen[0].sets or {}).items()})
    return out


def inputs_to_matrix(
    inputs: Sequence[Mapping[str, InputValue]], schema: FeatureSchema | None = None
) -> pd.DataFrame:
    """The single encoder. Client-sent derived fields are ignored and recomputed."""
    schema = schema or load_schema()
    cols = schema.model_columns
    rows = [_encode_row(i, schema) for i in inputs]
    return pd.DataFrame(rows, columns=cols, dtype="float64")


def raw_to_matrix(df: pd.DataFrame, schema: FeatureSchema | None = None) -> pd.DataFrame:
    schema = schema or load_schema()
    return inputs_to_matrix(raw_to_inputs(df, schema), schema)
