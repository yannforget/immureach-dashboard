import json
import re
import unicodedata
from pathlib import Path

import pandas as pd

import scripts.ecv.constants as cst

NAME_PREFIX_RE = re.compile(r"^[A-Za-z]{2}\s+")
NAME_SUFFIX_RE = re.compile(
    r"\s+(Province|Zone\s+de\s+Sant\w*|Aire\s+de\s+Sant\w*)\s*$",
    flags=re.IGNORECASE,
)


def clean_name(series: pd.Series) -> pd.Series:
    """Strip the province code prefix and the level suffix off."""
    return (
        series.astype(str)
        .str.replace(NAME_PREFIX_RE, "", regex=True)
        .str.replace(NAME_SUFFIX_RE, "", regex=True)
        .str.strip()
    )


def find_input(year: str) -> Path:
    """The round's Stata export: ECV_<year>_*.dta, or ECV<year>_*.dta (2026)."""
    pattern = re.compile(rf"ECV_?{year}_.*\.dta")
    matches = sorted(p for p in cst.INPUT_DIR.iterdir() if pattern.fullmatch(p.name))
    if not matches:
        raise FileNotFoundError(f"no ECV_{year}_*.dta / ECV{year}_*.dta in {cst.INPUT_DIR}")
    if len(matches) > 1:
        print(
            f"  WARNING: {len(matches)} files match the {year} round, using "
            f"{matches[0].name}"
        )
    return matches[0]


def _decode_geography(raw: pd.DataFrame) -> pd.DataFrame:
    """Turn a coded round's geography into the names the other rounds carry.

    q101 "KL" -> "kl Kwilu"; q103 "KL_KL_BENA_DIBELE" -> "kl Bena Dibele";
    q105 "KL_KL_BAGATA_KL_MOSANGO" -> "kl Mosango", which clean_name() then
    treats like the earlier rounds' "kl Kwilu Province" and so on.
    """
    raw = raw.copy()
    codes = raw[cst.STRATUM_COL].astype(str).str.strip()
    unknown = sorted(set(codes) - set(cst.PROVINCE_BY_CODE))
    if unknown:
        raise ValueError(f"unknown province code(s) in {cst.STRATUM_COL}: {unknown}")
    zone_codes = raw[cst.ZONE_COL].astype(str).str.strip()
    # Prefixed with the lower-case province code, as in the earlier rounds:
    # clean_name() strips it, and without it a name that happens to start
    # with two letters and a space would lose its first word instead.
    prefix = codes.str.lower() + " "
    raw[cst.STRATUM_COL] = prefix + codes.map(cst.PROVINCE_BY_CODE)
    raw[cst.ZONE_COL] = prefix + (
        zone_codes.str.split("_", n=2).str[2].str.replace("_", " ").str.title()
    )
    # The area code repeats the zone code, then "<province code>_<area name>".
    area_codes = raw[cst.AREA_COL].astype(str).str.strip()
    raw[cst.AREA_COL] = prefix + pd.Series(
        [
            a[len(z) + 1 :].split("_", 1)[-1].replace("_", " ").title()
            if a.startswith(z + "_")
            else a
            for a, z in zip(area_codes, zone_codes)
        ],
        index=raw.index,
    )
    return raw


def read_round(dta_path: Path, year: str, columns: list[str]) -> pd.DataFrame:
    """Read `columns` of one round, under the names the 2022/2023 files use.

    Smooths over what changed between rounds: the weight column
    (WEIGHT_COL_BY_YEAR) and coded geography (CODED_GEOGRAPHY_YEARS).
    """
    weight_col = cst.WEIGHT_COL_BY_YEAR.get(year, cst.WEIGHT_COL)
    source = [weight_col if c == cst.WEIGHT_COL else c for c in columns]
    raw = pd.read_stata(dta_path, columns=source, convert_categoricals=False)
    raw = raw.rename(columns={weight_col: cst.WEIGHT_COL})
    if year in cst.CODED_GEOGRAPHY_YEARS:
        raw = _decode_geography(raw)
    return raw


def normalize(name: str) -> str:
    """Accent- and case-insensitive key for joining names across sources."""
    stripped = NAME_SUFFIX_RE.sub("", NAME_PREFIX_RE.sub("", str(name))).strip()
    decomposed = unicodedata.normalize("NFD", stripped)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


def load_geojson_names(path: Path) -> tuple[dict[str, str], dict[str, tuple[str, str]]]:
    """Canonical province / zone names from the dashboard's zone boundaries."""
    if not path.exists():
        raise FileNotFoundError(
            f"zone boundaries not found: {path}\n"
            "Run scripts/generate-boundaries.py first."
        )
    geo = json.loads(path.read_text(encoding="utf-8"))
    features = geo.get("features", [])
    provinces: dict[str, str] = {}
    zones: dict[str, tuple[str, str]] = {}
    for feature in features:
        props = feature.get("properties", {})
        raw_province = props.get("level_2_name")
        raw_zone = props.get("level_3_name")
        if not raw_province or not raw_zone:
            print(f"  WARNING: geojson feature without a name: {props}")
            continue
        province = NAME_SUFFIX_RE.sub(
            "", NAME_PREFIX_RE.sub("", str(raw_province))
        ).strip()
        zone = NAME_SUFFIX_RE.sub("", NAME_PREFIX_RE.sub("", str(raw_zone))).strip()
        provinces[normalize(province)] = province
        zones[f"{normalize(province)}|{normalize(zone)}"] = (province, zone)
    print(
        f"  {path.relative_to(cst.PROJECT_ROOT)}: {len(features)} features -> "
        f"{len(provinces)} provinces, {len(zones)} zones"
    )
    if len(zones) != len(features):
        print(
            f"  WARNING: {len(features) - len(zones)} feature(s) collapsed onto an "
            "existing province|zone key (duplicate geometry?)"
        )
    return provinces, zones


def canonicalize_names(
    df: pd.DataFrame,
    provinces: dict[str, str],
    zones: dict[str, tuple[str, str]],
) -> pd.DataFrame:
    """Replace the survey's free-text names with the geojson spelling.

    Rows whose province|zone pair is unknown to the geojson are flagged
    (`in_geo` = False) rather than dropped: they could not be drawn on the map,
    so R never estimates on them, but they stay in the survey design.
    """
    key = df["province"].map(normalize) + "|" + df["zone"].map(normalize)
    matched = key.map(zones)
    unknown = matched.isna()

    if unknown.any():
        missing = (
            df.loc[unknown, ["province", "zone"]]
            .value_counts()
            .rename("children")
            .reset_index()
        )
        print(
            f"  WARNING: {len(missing)} survey zone(s) "
            f"({int(unknown.sum()):,} children, all ages) are not in the boundaries "
            "file; they stay in the design but are never estimated on:"
        )
        for row in missing.head(20).itertuples():
            print(f"    {row.province} / {row.zone} ({row.children:,} children)")
        if len(missing) > 20:
            print(f"    ... and {len(missing) - 20} more")
    else:
        print("  every survey zone matched a boundary zone")

    unknown_provinces = sorted(
        set(df["province"].map(normalize)) - set(provinces)
    )
    if unknown_provinces:
        print(f"  WARNING: province(s) absent from the boundaries: {unknown_provinces}")

    df = df.copy()
    df["in_geo"] = ~unknown
    df["geo_province"] = [p[0] if isinstance(p, tuple) else None for p in matched]
    df["geo_zone"] = [p[1] if isinstance(p, tuple) else None for p in matched]
    df["geo_zone_key"] = (df["geo_province"] + " | " + df["geo_zone"]).where(
        df["in_geo"]
    )

    never_surveyed = sorted(
        zones[k][0] + " / " + zones[k][1] for k in set(zones) - set(key[~unknown])
    )
    if never_surveyed:
        print(
            f"  note: {len(never_surveyed)} boundary zone(s) have no survey data "
            "this year (they will simply be missing from the CSV), e.g. "
            f"{never_surveyed[:5]}"
        )
    return df
