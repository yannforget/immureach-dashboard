"""Build the dashboard runtime GeoJSONs from data/output/{boundaries,predictions,population}.

Run: uv run scripts/build-dashboard-geojson.py

Outputs:
    public/data/provinces.geojson  (26 features)
    public/data/zones.geojson      (519 features)

The dashboard reads each feature's properties verbatim, so the property shape
here is the runtime contract. See src/types/index.ts and src/lib/dataUtils.ts.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "output"
OUT_DIR = PROJECT_ROOT / "public" / "data"

METRIC_KEYS = [
    "pred_bcg",
    "pred_rota",
    "pred_var",
    "pred_vaa",
    "pred_polio",
    "pred_pcv",
    "pred_zerodosepenta",
    "pred_zerodoseall",
]

POP_RENAMES = {
    "pop_u1": "pop_0_12mo",
    "pop_u5": "pop_0_5yo",
    "pop_6_12mo": "pop_6_12mo",
    "pop_12_24mo": "pop_12_24mo",
    "pop_6_24mo": "pop_6_24mo",
    "births_per_year": "births_per_year",
    "total_population": "total_population",
    "imr": "imr",
}

POP_FIELDS_ORDER = [
    "total_population",
    "pop_0_12mo",
    "pop_0_5yo",
    "pop_6_12mo",
    "pop_12_24mo",
    "pop_6_24mo",
    "births_per_year",
    "imr",
]

PREFIX_RE = re.compile(r"^[a-z]{2}\s")


def load_predictions_provinces() -> dict[str, dict[str, float]]:
    df = pd.read_csv(DATA_DIR / "predictions" / "provinces.csv")
    return {row["province"]: {k: float(row[k]) for k in METRIC_KEYS} for _, row in df.iterrows()}


def load_predictions_zones() -> dict[tuple[str, str], dict[str, float]]:
    df = pd.read_csv(DATA_DIR / "predictions" / "zones.csv")
    return {
        (row["province"], row["zone"]): {k: float(row[k]) for k in METRIC_KEYS}
        for _, row in df.iterrows()
    }


def _to_optional_float(value) -> float | None:
    """Coerce a value to float, returning None for NaN / missing.

    Some upstream population rows carry NaN (e.g. hk Kowe, ll Lualaba). We
    surface those as JSON null so the dashboard can render them as 'no data'
    instead of crashing on the non-standard `NaN` literal.
    """
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    return f


def _pop_record(row: pd.Series) -> dict[str, float | None]:
    return {
        dest: _to_optional_float(row[src])
        for src, dest in POP_RENAMES.items()
        if src in row.index
    }


def load_population_provinces() -> dict[str, dict[str, float]]:
    df = pd.read_csv(DATA_DIR / "population" / "provinces.csv")
    return {row["level_2_name"]: _pop_record(row) for _, row in df.iterrows()}


def load_population_zones() -> dict[tuple[str, str], dict[str, float]]:
    df = pd.read_csv(DATA_DIR / "population" / "zones.csv")
    return {
        (row["level_2_name"], row["level_3_name"]): _pop_record(row) for _, row in df.iterrows()
    }


def add_predictions(props: dict, preds: dict | None, pop_6_24mo: float | None) -> None:
    for key in METRIC_KEYS:
        pred = _to_optional_float(preds[key]) if preds is not None else None
        props[key] = pred
        if pred is not None and pop_6_24mo is not None:
            props[f"{key}_count"] = pred * pop_6_24mo
        else:
            props[f"{key}_count"] = None


def build_province_feature(
    feature: dict,
    preds: dict[str, float] | None,
    pops: dict[str, float],
) -> dict:
    src = feature["properties"]
    props: dict = {
        "q101": src["level_2_name"],
        "level_1_id": src.get("level_1_id"),
        "level_1_name": src.get("level_1_name"),
        "level_2_id": src.get("level_2_id"),
        "level_2_name": src.get("level_2_name"),
    }
    for field in POP_FIELDS_ORDER:
        props[field] = pops.get(field)
    add_predictions(props, preds, pops.get("pop_6_24mo"))
    return {"type": "Feature", "geometry": feature["geometry"], "properties": props}


def build_zone_feature(
    feature: dict,
    preds: dict[str, float] | None,
    pops: dict[str, float],
) -> dict:
    src = feature["properties"]
    props: dict = {
        "q101": src["level_2_name"],
        "q103": src["level_3_name"],
        "level_1_id": src.get("level_1_id"),
        "level_1_name": src.get("level_1_name"),
        "level_2_id": src.get("level_2_id"),
        "level_2_name": src.get("level_2_name"),
        "level_3_id": src.get("level_3_id"),
        "level_3_name": src.get("level_3_name"),
    }
    for field in POP_FIELDS_ORDER:
        props[field] = pops.get(field)
    add_predictions(props, preds, pops.get("pop_6_24mo"))
    return {"type": "Feature", "geometry": feature["geometry"], "properties": props}


def write_geojson(path: Path, features: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fc = {"type": "FeatureCollection", "features": features}
    with path.open("w", encoding="utf-8") as f:
        # allow_nan=False guards against any sneaky NaN slipping through into
        # invalid JSON (the browser fetch would otherwise fail to parse).
        json.dump(fc, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def assert_clean_name(raw: str) -> None:
    """The dashboard's cleanName() strips ^[a-z]{2}\\s then ' Province' / ' Zone de Santé'.
    After cleaning, no name should still start with a 2-letter+space prefix.
    """
    cleaned = PREFIX_RE.sub("", raw)
    cleaned = re.sub(r" Province$", "", cleaned)
    cleaned = re.sub(r" Zone de Santé$", "", cleaned)
    assert not PREFIX_RE.match(cleaned), f"unexpected double-prefix in {raw!r} -> {cleaned!r}"


def main() -> None:
    print(f"Reading from: {DATA_DIR}")
    print(f"Writing to:   {OUT_DIR}")

    pred_prov = load_predictions_provinces()
    pred_zone = load_predictions_zones()
    pop_prov = load_population_provinces()
    pop_zone = load_population_zones()

    # --- Provinces ---
    with (DATA_DIR / "boundaries" / "provinces.geojson").open() as f:
        prov_gj = json.load(f)

    # Stable order by level_2_id.
    prov_features_src = sorted(
        prov_gj["features"], key=lambda f: f["properties"]["level_2_id"]
    )

    prov_pred_matched = 0
    prov_pop_matched = 0
    out_provinces: list[dict] = []
    out_of_range: list[tuple[str, str, float]] = []

    for feat in prov_features_src:
        name = feat["properties"]["level_2_name"]
        assert_clean_name(name)
        preds = pred_prov.get(name)
        pops = pop_prov.get(name)
        if preds is not None:
            prov_pred_matched += 1
            for k, v in preds.items():
                if not (0.0 <= v <= 1.05):
                    out_of_range.append((name, k, v))
        if pops is not None:
            prov_pop_matched += 1
        else:
            raise SystemExit(f"province missing population: {name!r}")
        if preds is None:
            raise SystemExit(f"province missing predictions: {name!r}")
        out_provinces.append(build_province_feature(feat, preds, pops))

    # --- Zones ---
    with (DATA_DIR / "boundaries" / "zones.geojson").open() as f:
        zone_gj = json.load(f)

    zone_features_src = sorted(
        zone_gj["features"],
        key=lambda f: (f["properties"]["level_2_id"], f["properties"]["level_3_id"]),
    )

    zone_pred_matched = 0
    zone_pop_matched = 0
    zone_pred_missing: list[str] = []
    out_zones: list[dict] = []

    for feat in zone_features_src:
        l2 = feat["properties"]["level_2_name"]
        l3 = feat["properties"]["level_3_name"]
        assert_clean_name(l2)
        assert_clean_name(l3)
        preds = pred_zone.get((l2, l3))
        pops = pop_zone.get((l2, l3))
        if pops is None:
            raise SystemExit(f"zone missing population: {(l2, l3)!r}")
        zone_pop_matched += 1
        if preds is not None:
            zone_pred_matched += 1
            for k, v in preds.items():
                if not (0.0 <= v <= 1.05):
                    out_of_range.append((l3, k, v))
        else:
            zone_pred_missing.append(l3)
        out_zones.append(build_zone_feature(feat, preds, pops))

    # --- Summary ---
    print(f"Provinces: {len(out_provinces)} features")
    print(f"  preds matched: {prov_pred_matched}/{len(out_provinces)}")
    print(f"  pops  matched: {prov_pop_matched}/{len(out_provinces)}")
    print(f"Zones: {len(out_zones)} features")
    print(f"  preds matched: {zone_pred_matched}/{len(out_zones)}")
    print(f"  pops  matched: {zone_pop_matched}/{len(out_zones)}")
    print(f"  preds missing: {len(zone_pred_missing)}")
    for name in zone_pred_missing:
        print(f"    - {name}")

    if out_of_range:
        print(f"WARN: {len(out_of_range)} prediction(s) outside [0, 1.05]:")
        for n, k, v in out_of_range[:10]:
            print(f"  - {n} {k} = {v}")

    write_geojson(OUT_DIR / "provinces.geojson", out_provinces)
    write_geojson(OUT_DIR / "zones.geojson", out_zones)

    for name in ("provinces", "zones"):
        path = OUT_DIR / f"{name}.geojson"
        size_mb = path.stat().st_size / (1024 * 1024)
        print(f"Wrote {path.relative_to(PROJECT_ROOT)}  ({size_mb:.2f} MB)")
        if size_mb > 5.0:
            print(f"  WARN: {path.name} > 5 MB; consider coordinate simplification.")


if __name__ == "__main__":
    main()
