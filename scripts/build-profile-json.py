"""Build the dashboard profiling sidecar (public/data/profile.json).

Run: uv run scripts/build-profile-json.py

Reads the accessibility output tree:
    data/output/accessibility/{national,province,zone}_{2023,2024}.csv

and emits a single JSON file consumed by the Profiling-mode panel:

    public/data/profile.json
        { "years": [...], "accessibility": {...} }

Area keys (`q101`, `q103`) match the raw level_2_name / level_3_name strings
already used as ECharts shape keys by the runtime geojsons, so the frontend
looks up profile rows with the same identifiers it already has on the bar /
map data points.

The household behaviour indicators live in their own sidecar, built by
scripts/household_model/build-behaviour-indicators.py.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

import pandas as pd

# Mirror of cleanName() in src/lib/dataUtils.ts: drops the "<lo> " prefix and
# the " Province" / " Zone de Santé" suffixes. The accessibility CSVs already
# carry cleaned names, and the frontend resolves scope by cleaned displayName —
# so we normalise everything to the cleaned form on the way out.
_PREFIX_RE = re.compile(r"^[a-z]{2}\s")


def _clean_name(name: str) -> str:
    if not isinstance(name, str):
        return name
    out = _PREFIX_RE.sub("", name)
    out = re.sub(r" Province$", "", out)
    out = re.sub(r" Zone de Santé$", "", out)
    return out


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ACCESS_DIR = PROJECT_ROOT / "data" / "output" / "accessibility"
OUT_PATH = PROJECT_ROOT / "public" / "data" / "profile.json"

YEARS = [2023, 2024]
THRESHOLDS = [30, 60, 90, 120, 150, 180]


def _opt(value) -> float | None:
    """Coerce to float, return None for NaN / missing."""
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(f):
        return None
    return f


def _access_row(row: pd.Series) -> dict:
    n_0d = _opt(row.get("n_0d"))
    n_total = _opt(row.get("n"))
    isochrones = []
    for t in THRESHOLDS:
        isochrones.append(
            {
                "min": t,
                "n_0d": _opt(row.get(f"n_0d_{t}mn")),
                "n": _opt(row.get(f"n_{t}mn")),
            }
        )
    return {
        "n_0d": n_0d,
        "n": n_total,
        "isochrones": isochrones,
    }


def build_accessibility() -> dict:
    out: dict = {"thresholds": THRESHOLDS}
    for year in YEARS:
        national_df = pd.read_csv(ACCESS_DIR / f"national_{year}.csv")
        province_df = pd.read_csv(ACCESS_DIR / f"province_{year}.csv")
        zone_df = pd.read_csv(ACCESS_DIR / f"zone_{year}.csv")

        national = _access_row(national_df.iloc[0]) if len(national_df) else None
        provinces = {
            _clean_name(row["level_2_name"]): _access_row(row)
            for _, row in province_df.iterrows()
        }
        zones = {
            _clean_name(row["level_3_name"]): _access_row(row)
            for _, row in zone_df.iterrows()
        }

        out[str(year)] = {
            "national": national,
            "provinces": provinces,
            "zones": zones,
        }
    return out


def main() -> None:
    print(f"Reading from: {ACCESS_DIR}")
    print(f"Writing to:   {OUT_PATH}")

    payload = {
        "years": YEARS,
        "accessibility": build_accessibility(),
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as f:
        # allow_nan=False guards against any sneaky NaN slipping through into
        # invalid JSON that the browser would fail to parse.
        json.dump(
            payload, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False
        )

    size_kb = OUT_PATH.stat().st_size / 1024
    n_provinces = len(payload["accessibility"][str(YEARS[-1])]["provinces"])
    n_zones = len(payload["accessibility"][str(YEARS[-1])]["zones"])
    print(
        f"Wrote {OUT_PATH.relative_to(PROJECT_ROOT)}  ({size_kb:.1f} KB, "
        f"{n_provinces} provinces, {n_zones} zones)"
    )


if __name__ == "__main__":
    main()
