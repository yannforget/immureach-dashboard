"""
Copy the vaccination-coverage dataset and append synthetic rows for year 2023.

For every existing row, a new row is generated with:
- year               -> forced to 2023
- province, zone, level -> copied as-is from the source row
- nb_children        -> original value +/- a random integer in [-10, 10]
- *_pct columns       -> original value + a random float in [-5, 5]   (clipped to [0, 100])
- *_low / *_high cols -> original value + a random float in [-1.5, 1.5] (clipped to [0, 100])

The result (original rows + new 2023 rows) is written to a new file; the
input file itself is never modified.

Usage (with uv, dependencies are resolved automatically from the inline
script metadata above):
 🚨🚨🚨🚨 TO RUN AFTER PREPARE-ECV-VACCINATION-COVERAGE.PY 🚨🚨🚨🚨

    uv run scripts/add-2023-ecv-vaccination-coverage.py
    uv run scripts/add-2023-ecv-vaccination-coverage.py --seed 42
    uv run scripts/add-2023-ecv-vaccination-coverage.py --input /path/to/data.csv --output /path/to/out.csv
"""

from __future__ import annotations

import argparse
import random
from pathlib import Path

import pandas as pd

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "public" / "data" / "ecv_vaccination_coverage.csv"
DEFAULT_OUTPUT = PROJECT_ROOT / "public" / "data" / "ecv_vaccination_coverage.csv"

NEW_YEAR = 2023

# Columns that identify a row / must be copied verbatim into the new rows.
IDENTIFIER_COLS = ["province", "zone", "level"]

# Perturbation ranges
PCT_DELTA = 5.0  # *_pct        -> +/- 5
BOUND_DELTA = 1.5  # *_low/_high  -> +/- 1.5
NB_CHILDREN_DELTA = 10  # nb_children  -> +/- 10 (integer)

PCT_BOUNDS = (0.0, 100.0)


def build_2023_rows(df: pd.DataFrame, rng: random.Random) -> pd.DataFrame:
    """Return a new DataFrame with one synthetic 2023 row per row of `df`."""
    new_df = df.copy(deep=True)

    pct_cols = [c for c in df.columns if c.endswith("_pct")]
    bound_cols = [c for c in df.columns if c.endswith(("_low", "_high"))]

    for col in pct_cols:
        deltas = [rng.uniform(-PCT_DELTA, PCT_DELTA) for _ in range(len(df))]
        new_df[col] = (
            (df[col] + deltas).clip(lower=PCT_BOUNDS[0], upper=PCT_BOUNDS[1]).round(1)
        )

    for col in bound_cols:
        deltas = [rng.uniform(-BOUND_DELTA, BOUND_DELTA) for _ in range(len(df))]
        new_df[col] = (
            (df[col] + deltas).clip(lower=PCT_BOUNDS[0], upper=PCT_BOUNDS[1]).round(1)
        )

    if "nb_children" in df.columns:
        deltas = [
            rng.randint(-NB_CHILDREN_DELTA, NB_CHILDREN_DELTA) for _ in range(len(df))
        ]
        target_dtype = (
            "int64"
            if pd.api.types.is_integer_dtype(df["nb_children"])
            else df["nb_children"].dtype
        )
        new_df["nb_children"] = (
            (df["nb_children"] + deltas).clip(lower=0).round().astype(target_dtype)
        )

    # Identifier columns are copied as-is (already true via df.copy()), just
    # being explicit here for readability / in case of future changes.
    for col in IDENTIFIER_COLS:
        if col in df.columns:
            new_df[col] = df[col]

    new_df["year"] = NEW_YEAR

    return new_df


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input", type=Path, default=DEFAULT_INPUT, help="Path to the source CSV."
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Path to write the augmented CSV.",
    )
    parser.add_argument(
        "--seed", type=int, default=None, help="Random seed for reproducibility."
    )
    args = parser.parse_args()

    rng = random.Random(args.seed)

    if not args.input.exists():
        raise FileNotFoundError(f"Input file not found: {args.input}")

    df = pd.read_csv(args.input)

    new_rows = build_2023_rows(df, rng)

    result = pd.concat([df, new_rows], ignore_index=True)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(args.output, index=False)

    print(f"Read {len(df)} rows from {args.input}")
    print(f"Appended {len(new_rows)} synthetic rows for year {NEW_YEAR}")
    print(f"Wrote {len(result)} rows to {args.output}")


if __name__ == "__main__":
    main()
