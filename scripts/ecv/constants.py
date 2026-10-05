from pathlib import Path

## Paths
PROJECT_ROOT = Path(__file__).resolve().parents[2]

print(PROJECT_ROOT)
INPUT_DIR = PROJECT_ROOT / "data" / "input" / "ecv"
ZONES_GEOJSON = PROJECT_ROOT / "data" / "output" / "boundaries" / "zones.geojson"
OUT_KEY_ECV_PATH = PROJECT_ROOT / "public" / "data" / "key_ecv.csv"
OUT_VACC_COV_PATH = PROJECT_ROOT / "public" / "data" / "ecv_vaccination_coverage.csv"
OUT_CARACTERISTICS_PATH = PROJECT_ROOT / "public" / "data" / "ecv_caracteristics.csv"

R_KEY_PATH = PROJECT_ROOT / "scripts" / "ecv" / "rscripts" / "rscript_key_ecv.R"
R_VACC_COV_PATH = (
    PROJECT_ROOT / "scripts" / "ecv" / "rscripts" / "rscript_vaccination_coverage.R"
)
R_CARACTERISTICS_PATH = (
    PROJECT_ROOT / "scripts" / "ecv" / "rscripts" / "rscript_caracteristics.R"
)

## Survey rounds
# Rounds are keyed by the year in the source filename. The 2022 and 2023
# exports are named after the year before collection; 2026 is named after its
# own fieldwork (April-May 2026). See docs/ecv2026.md.
YEARS = ("2022", "2023", "2026")
COLLECTION_YEAR = {"2022": "2023", "2023": "2024", "2026": "2026"}
SOURCE_GLOB = {
    "2022": "ECV_2022_*.dta",
    "2023": "ECV_2023_*.dta",
    "2026": "ECV2026_*.dta",
}

## Filters
AGE_MIN_MONTHS = 6
AGE_MAX_MONTHS = 24

# The dashboard's age ribbon filter, as "<youngest>-<oldest>" age in completed
# months, both bounds INCLUDED (6-11 keeps the 11-month-olds). The labels are
# handed to R as is; R parses the bounds and estimates each window as a domain.
# Only the coverage and characteristics files are split by age; key_ecv.csv
# (the cards) keeps the single AGE_MIN_MONTHS-AGE_MAX_MONTHS window.
AGE_GROUPS = ("6-11", "12-23", "6-23")
# Rounds that only support some of the windows. ECV 2026 targeted 12-23 month
# olds: its file holds fewer than a thousand 6-11 month olds nationally, too few
# for any province or zone estimate, so that window is not published for 2026.
AGE_GROUPS_BY_YEAR = {"2026": ("12-23", "6-23")}

# Survey design + geography columns, identical to the coverage script.
STRATUM_COL = "q101"  # "Nom de la strate (de la province)"
ZONE_COL = "q103"  # "Nom de la zone de santé"
AREA_COL = "q105"  # "Nom de la grappe (de l'Aire de santé)" -- the PSU
WEIGHT_COL = "ponderation"
# Rounds whose child weight sits under another name. The 2026 weight is also on
# a different scale (it sums to ~0.8M instead of ~8.8M); every published figure
# is a proportion, so only the name matters here.
WEIGHT_COL_BY_YEAR = {"2026": "PonderationG"}
AGE_COL = "vs25"
AREAS_TOTAL_COL = "nbre_as"  # health areas in the zone (sampling frame)
AREAS_SURVEYED_COL = "nbre_asenq"  # health areas actually surveyed, per the file
# Rounds whose q101 / q103 / q105 hold codes ("KL", "KL_KL_BAGATA",
# "KL_KL_BAGATA_KL_MOSANGO") instead of free-text names; see
# utils.geography_names(). PROVINCE_BY_CODE is the crosswalk to the names
# zones.geojson uses (derived in docs/ecv2026.md).
CODED_GEOGRAPHY_YEARS = {"2026"}
PROVINCE_BY_CODE = {
    "BU": "Bas Uele",
    "EQ": "Equateur",
    "HK": "Haut Katanga",
    "HL": "Haut Lomami",
    "HU": "Haut Uele",
    "IT": "Ituri",
    "KC": "Kongo Central",
    "KE": "Kasai Oriental",
    "KG": "Kwango",
    "KL": "Kwilu",
    "KN": "Kinshasa",
    "KR": "Kasai Central",
    "KS": "Kasai",
    "LL": "Lualaba",
    "LM": "Lomami",
    "MD": "Maindombe",
    "MG": "Mongala",
    "MN": "Maniema",
    "NK": "Nord Kivu",
    "NU": "Nord Ubangi",
    "SK": "Sud Kivu",
    "SN": "Sankuru",
    "SU": "Sud Ubangi",
    "TN": "Tanganyika",
    "TP": "Tshopo",
    "TU": "Tshuapa",
}
MILIEU_COL = "q108"  # "Milieu de localisation du ménage"
MILIEU_BY_CODE = {1: "urbain", 2: "rural"}
MILIEUX = ("all", *MILIEU_BY_CODE.values())

## Variables and indicators
VACCINATED = 1
NOT_VACCINATED = 2

VACCINES_MAPPING = {
    "bcg": "bcg_merg",
    "penta1": "penta1_merg",
    "penta2": "penta2_merg",
    "penta3": "penta3_merg",
    "polio0": "vpo0_merg",
    "polio1": "vpo1_merg",
    "polio2": "vpo2_merg",
    "polio3": "vpo3_merg",
    "pcv1": "pcv1_merg",
    "pcv2": "pcv2_merg",
    "pcv3": "pcv3_merg",
    "rota1": "rota1_merg",
    "rota2": "rota2_merg",
    "rota3": "rota3_merg",
    "vpi": "vpi_merg",
    "var": "var_merg",
    "vaa": "vaa_merg",
}
