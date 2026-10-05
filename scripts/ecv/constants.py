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

## Filters
YEARS = ("2022", "2023")
COLLECTION_YEAR = {"2022": "2023", "2023": "2024"}
AGE_MIN_MONTHS = 6
AGE_MAX_MONTHS = 24

# The dashboard's age ribbon filter, as "<youngest>-<oldest>" age in completed
# months, both bounds INCLUDED (6-11 keeps the 11-month-olds). The labels are
# handed to R as is; R parses the bounds and estimates each window as a domain.
# Only the coverage and characteristics files are split by age; key_ecv.csv
# (the cards) keeps the single AGE_MIN_MONTHS-AGE_MAX_MONTHS window.
AGE_GROUPS = ("6-11", "12-23", "6-23")

# Survey design + geography columns, identical to the coverage script.
STRATUM_COL = "q101"  # "Nom de la strate (de la province)"
ZONE_COL = "q103"  # "Nom de la zone de santé"
AREA_COL = "q105"  # "Nom de la grappe (de l'Aire de santé)" -- the PSU
WEIGHT_COL = "ponderation"
AGE_COL = "vs25"
AREAS_TOTAL_COL = "nbre_as"  # health areas in the zone (sampling frame)
AREAS_SURVEYED_COL = "nbre_asenq"  # health areas actually surveyed, per the file
INTERVIEW_DATE_COL = "q117"  # "Date de début de l'interview lors de la visite"
SUBMISSION_DATE_COL = "SubmissionDate"  # server-side upload timestamp
MILIEU_COL = "q108"  # "Milieu de localisation du ménage"
MILIEU_BY_CODE = {1: "urbain", 2: "rural"}
MILIEUX = ("all", *MILIEU_BY_CODE.values())
# q117 is typed on the tablet and carries typos (years 2020, 2028...). An
# interview date is kept only if it falls this many days or fewer before the
# form's upload; 99% of forms are uploaded within ~26 days.
MAX_UPLOAD_LAG_DAYS = 30

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
