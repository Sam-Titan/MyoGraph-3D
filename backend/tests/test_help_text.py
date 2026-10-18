"""Input help text: every input has some; numbers in it come from config, never typed."""

import re

from ml.schema import NumberFeature, load_schema

SCHEMA = load_schema()


def test_every_input_has_help_text() -> None:
    for f in SCHEMA.features:
        assert f.help.strip(), f.id
        assert not f.help_text().strip().endswith(("..", ",")), f.id


def test_help_has_no_digits_except_from_config() -> None:
    for f in SCHEMA.features:
        assert not re.search(r"\d", f.help), f"{f.id}: type numbers as {{placeholders}}"
        allowed = set("".join(re.findall(r"\d", v)) for v in f._help_fields().values())
        digits = set(re.findall(r"\d", f.help_text()))
        assert digits <= set("".join(allowed)), f.id


def test_placeholders_resolve_to_the_feature_bounds() -> None:
    fc = next(f for f in SCHEMA.features if f.id == "function_class")
    assert isinstance(fc, NumberFeature)
    text = fc.help_text()
    assert f"from {fc.input.min:g}," in text and f"to {fc.input.max:g}," in text
    assert "{" not in text
