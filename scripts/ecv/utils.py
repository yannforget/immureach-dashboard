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


def source_file(year: str) -> Path:
    """The Stata export for one survey round (see cst.SOURCE_GLOB)."""
    pattern = cst.SOURCE_GLOB.get(year, f"ECV_{year}_*.dta")
    matches = sorted(cst.INPUT_DIR.glob(pattern))
    if not matches:
        raise FileNotFoundError(f"no {pattern} in {cst.INPUT_DIR}")
    if len(matches) > 1:
        print(f"  WARNING: {len(matches)} files match {pattern}, using {matches[0].name}")
    return matches[0]


def weight_col(year: str) -> str:
    return cst.WEIGHT_COL_BY_YEAR.get(year, cst.WEIGHT_COL)


def age_groups_for(year: str, age_groups: list[str]) -> list[str]:
    """The requested age windows this round supports (cst.AGE_GROUPS_BY_YEAR)."""
    allowed = cst.AGE_GROUPS_BY_YEAR.get(year)
    if allowed is None:
        return age_groups
    kept = [a for a in age_groups if a in allowed]
    dropped = [a for a in age_groups if a not in allowed]
    if dropped:
        print(f"  note: age group(s) {dropped} are not published for {year}")
    return kept


def geography_names(
    raw: pd.DataFrame, year: str
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Province, zone and aire de sante names off q101 / q103 / q105.

    The free-text rounds go through clean_name(). The coded rounds carry
    "KL", "KL_KL_BAGATA" and "KL_KL_BAGATA_KL_MOSANGO": the province comes off
    the crosswalk, the zone is what follows the second underscore (remaining
    underscores are spaces, as in "BENA_DIBELE"), and the aire de sante keeps
    its code, which is already unique within the zone.
    """
    province_raw = raw[cst.STRATUM_COL]
    zone_raw = raw[cst.ZONE_COL]
    area_raw = raw[cst.AREA_COL]
    if year not in cst.CODED_GEOGRAPHY_YEARS:
        return clean_name(province_raw), clean_name(zone_raw), clean_name(area_raw)

    codes = province_raw.astype(str).str.strip()
    unknown = sorted(set(codes) - set(cst.PROVINCE_BY_CODE))
    if unknown:
        raise ValueError(f"unknown province code(s) in {year}: {unknown}")
    zone = (
        zone_raw.astype(str)
        .str.strip()
        .str.split("_", n=2)
        .str[2]
        .str.replace("_", " ", regex=False)
    )
    if zone.isna().any():
        raise ValueError(
            f"{int(zone.isna().sum())} zone code(s) in {year} do not follow "
            "the <province>_<province>_<zone> pattern"
        )
    return codes.map(cst.PROVINCE_BY_CODE), zone, area_raw.astype(str).str.strip()


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


def geojson_spelling(
    df: pd.DataFrame, zones: dict[str, tuple[str, str]]
) -> pd.DataFrame:
    """Rename province / zone to the geojson spelling wherever the pair matches.

    Unlike canonicalize_names() nothing is flagged: unmatched rows keep their
    own names. Used where the survey names are shown as is, so that a coded
    round's "BENA DIBELE" reads like the free-text rounds' "Bena Dibele".
    """
    key = df["province"].map(normalize) + "|" + df["zone"].map(normalize)
    matched = key.map(zones)
    df = df.copy()
    df["province"] = [
        m[0] if isinstance(m, tuple) else p for m, p in zip(matched, df["province"])
    ]
    df["zone"] = [m[1] if isinstance(m, tuple) else z for m, z in zip(matched, df["zone"])]
    return df


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
