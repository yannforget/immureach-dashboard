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
