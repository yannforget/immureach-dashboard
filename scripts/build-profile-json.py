"""Build the dashboard profiling sidecar (public/data/profile.json).

Run: uv run scripts/build-profile-json.py

Reads two per-domain output trees:
    data/output/accessibility/{national,province,zone}_{2022,2023}.csv
    data/output/indicators/{national,province,zone}_{2022,2023}.csv

and emits a single JSON file consumed by the Profiling-mode panel:

    public/data/profile.json
        { "years": [...], "accessibility": {...}, "indicators": {...} }

Area keys (`q101`, `q103`) match the raw level_2_name / level_3_name strings
already used as ECharts shape keys by the runtime geojsons, so the frontend
looks up profile rows with the same identifiers it already has on the bar /
map data points.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

import pandas as pd

# Mirror of cleanName() in src/lib/dataUtils.ts: drops the "<lo> " prefix and
# the " Province" / " Zone de Santé" suffixes. The accessibility CSVs already
# carry cleaned names, the indicators CSVs carry raw prefixed names, and the
# frontend resolves scope by cleaned displayName — so we normalise everything
# to the cleaned form on the way out.
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
INDIC_DIR = PROJECT_ROOT / "data" / "output" / "indicators"
OUT_PATH = PROJECT_ROOT / "public" / "data" / "profile.json"

YEARS = [2022, 2023]
THRESHOLDS = [30, 60, 90, 120, 150, 180]

INDICATORS = [
    "trust_in_hcw",
    "affordability",
    "missed_opportunities",
    "ease_to_vaccinate_children",
    "outreach",
    "community_norms",
    "fear_side_effects",
    "fear_diseases",
    "opinion_on_vaccines",
    "self_efficacy",
    "knowledge_diseases",
    "knowledge_vaccines",
    "household_travel_ohe",
    "is_max_ethnic_group",
]

# One-line plain-English explanation of each composite index, shown to
# decision-makers in the Profiling-mode dumbbell tooltip. Sourced from the
# "Household - details" sheet of data/input/immureach/details_models.xlsx
# (Variable / Theoretical domain / Composite index columns).
INDICATOR_DESCRIPTIONS = {
    "trust_in_hcw": "Perceived welcome and quality of interaction at the health centre during the last visit.",
    "affordability": "Out-of-pocket costs households face for vaccination (e.g. paying for the vaccination card).",
    "missed_opportunities": "Past instances where a child was brought to a health centre for vaccination but not vaccinated.",
    "ease_to_vaccinate_children": "Perceived ease of obtaining vaccination services for one's child.",
    "outreach": "Frequency of home visits from community outreach workers.",
    "community_norms": "Belief that most parents in the community vaccinate their children.",
    "fear_side_effects": "Reported awareness of children who experienced side effects (e.g. abscess) after vaccination.",
    "fear_diseases": "Perceived seriousness of vaccine-preventable diseases.",
    "opinion_on_vaccines": "Perceived importance of vaccines for the child's health.",
    "self_efficacy": "Caregiver's confidence in their ability to bring the child to scheduled vaccination sessions.",
    "knowledge_diseases": "Knowledge of which childhood illnesses can be prevented by vaccination.",
    "knowledge_vaccines": "Knowledge of vaccination logistics — campaigns, dates, target age groups.",
    "household_travel_ohe": "Whether household members lived or travelled away from home in the past year.",
    "is_max_ethnic_group": "Cultural alignment between the respondent's ethnic group and the dominant group of the zone.",
}


def _label(key: str) -> str:
    return key.replace("_", " ").capitalize()


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


def _indicator_entries(rows_zd: pd.Series | None, rows_nzd: pd.Series | None) -> dict:
    """Return { indicator_key: { zd, vacc, zd_raw, vacc_raw } } for the two groups.

    zero_dose_penta == 1 → zero-dose; zero_dose_penta == 0 → vaccinated.
    Either row may be absent (small / unsampled areas), in which case the
    corresponding values are None.
    """
    entry: dict = {}
    for ind in INDICATORS:
        entry[ind] = {
            "zd": _opt(rows_zd[f"{ind}_scaled"]) if rows_zd is not None else None,
            "vacc": _opt(rows_nzd[f"{ind}_scaled"]) if rows_nzd is not None else None,
            "zd_raw": _opt(rows_zd[ind]) if rows_zd is not None else None,
            "vacc_raw": _opt(rows_nzd[ind]) if rows_nzd is not None else None,
        }
    return entry


def _split_zero_dose(df: pd.DataFrame, area_col: str | None) -> dict:
    """Group rows by area, returning { area: { 0: vacc_row, 1: zd_row } }.

    For national-level data pass area_col=None; the result then has the single
    sentinel key "_national_".
    """
    result: dict = {}
    if area_col is None:
        groups = [("_national_", df)]
    else:
        groups = list(df.groupby(area_col))

    for area, sub in groups:
        rows: dict = {}
        for _, row in sub.iterrows():
            zd = int(row["zero_dose_penta"])
            rows[zd] = row
        result[area] = rows
    return result


def build_indicators() -> dict:
    out: dict = {
        "meta": [
            {
                "key": k,
                "label": _label(k),
                "description": INDICATOR_DESCRIPTIONS.get(k, ""),
            }
            for k in INDICATORS
        ],
    }
    for year in YEARS:
        national_df = pd.read_csv(INDIC_DIR / f"national_{year}.csv")
        province_df = pd.read_csv(INDIC_DIR / f"province_{year}.csv")
        zone_df = pd.read_csv(INDIC_DIR / f"zone_{year}.csv")

        national_groups = _split_zero_dose(national_df, None)["_national_"]
        national = _indicator_entries(
            national_groups.get(1), national_groups.get(0)
        )

        provinces: dict = {}
        for area, rows in _split_zero_dose(province_df, "province").items():
            provinces[_clean_name(area)] = _indicator_entries(rows.get(1), rows.get(0))

        zones: dict = {}
        for area, rows in _split_zero_dose(zone_df, "zone").items():
            zones[_clean_name(area)] = _indicator_entries(rows.get(1), rows.get(0))

        out[str(year)] = {
            "national": national,
            "provinces": provinces,
            "zones": zones,
        }
    return out


def main() -> None:
    print(f"Reading from: {ACCESS_DIR} and {INDIC_DIR}")
    print(f"Writing to:   {OUT_PATH}")

    payload = {
        "years": YEARS,
        "accessibility": build_accessibility(),
        "indicators": build_indicators(),
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as f:
        # allow_nan=False guards against any sneaky NaN slipping through into
        # invalid JSON that the browser would fail to parse.
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)

    size_kb = OUT_PATH.stat().st_size / 1024
    n_provinces = len(payload["accessibility"][str(YEARS[-1])]["provinces"])
    n_zones = len(payload["accessibility"][str(YEARS[-1])]["zones"])
    print(
        f"Wrote {OUT_PATH.relative_to(PROJECT_ROOT)}  ({size_kb:.1f} KB, "
        f"{n_provinces} provinces, {n_zones} zones, {len(INDICATORS)} indicators)"
    )


if __name__ == "__main__":
    main()
