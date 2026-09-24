"""Every characteristics indicator the ECV pipeline knows about, in one table.

`INDICATORS` below is the single place a characteristics variable is declared:
its key, its French label, and -- per survey round -- the source column and the
codes counted as a "yes". scripts/process-ecv-caracteristics.py reads nothing
else to decide what to estimate, so adding an entry here is enough to put a
`<root>_pct/_low/_high` family in public/data/ecv_caracteristics.csv; to chart
it, list the root in ECV_CARACTERISTIC_KEYS and give it a French label in
ECV_CARACTERISTIC_VARIABLE_LABELS, plus an ECV_CARACTERISTIC_GROUPS entry when
several variables belong on one tab (src/lib/utils/constants.ts). Roots absent
from ECV_CARACTERISTIC_KEYS are parsed but never drawn.

    import indicators as ind

    ind.INDICATORS                        # the table, in chart order
    ind.BY_KEY["mere"]                    # one Indicator, by its key
    ind.VARIABLES                         # every key, same order
    ind.PARTITIONS                        # sets that have to add up to 100%
    ind.source_columns(variables, year)   # columns a round has to provide

WHAT THE VARIABLES ARE. Grouped by theme; the source column and the codes
counted as "yes" are in INDICATORS, and every code outside the yes/no lists
("ne sait pas", "non-reponse", ...) becomes a missing value rather than a "no".

  Document de vaccination
    possession_carte      has a vaccination card/booklet (`vs26`), whether or
                          not the interviewer got to see it
    carte_ou_document     has a card *or* any other document from a health
                          worker -- the wider definition of the same question

  Mere / gardienne (who answered for the child)
    mere                  the respondent is the child's mother (`qa100`)
    gardienne             the respondent is another caregiver (same question);
                          mere + gardienne sum to 100% by construction

  Enregistrement de la naissance
    certificat_naissance  the child has a birth certificate (`vs25d`, seen or
                          declared)
    naissance_enregistree the birth was registered with the civil authority
                          (`vs25e`)

  Importance percue des vaccins -- BeSD4, one variable per modality of the
  4-point scale, so the four add up to 100% of the children who answered:
    besd4_pas_important / besd4_peu_important / besd4_moyen_important /
    besd4_tres_important

  Confiance dans les agents de sante -- BeSD6, same 4-modality shape:
    besd6_aucune_confiance / besd6_confiance_limitee /
    besd6_confiance_moyenne / besd6_grande_confiance

  Difficultes d'acces a la vaccination -- BeSD19, the multi-select battery
  BeSD19_a .. BeSD19_e. These are *not* a partition: a caregiver can name
  several reasons, so the five variables do not add up to 100% and the chart
  draws them side by side rather than stacked.
    besd19_aucune_difficulte  nothing, access is not difficult (BeSD19_a)
    besd19_trajet             getting to the facility is difficult (BeSD19_b)
    besd19_horaires           opening hours are inconvenient (BeSD19_c)
    besd19_refoulement        the facility sometimes turns people away
                              without vaccinating them (BeSD19_d)
    besd19_attente            the wait at the facility is too long (BeSD19_e)

  Problemes des services de vaccination -- BeSD20, the multi-select battery
  BeSD21_a .. BeSD21_h (same non-partition caveat):
    besd21_satisfait    nothing, the caregiver is satisfied (BeSD21_a)
    besd21_rupture      the vaccine is not always available (BeSD21_b)
    besd21_ouverture    the facility does not open on time (BeSD21_c)
    besd21_attente      waiting times are long (BeSD21_d)
    besd21_proprete     the facility is not clean (BeSD21_e)
    besd21_formation    staff are poorly trained (BeSD21_f)
    besd21_respect      staff are not respectful (BeSD21_g)
    besd21_temps        staff do not spend enough time with people (BeSD21_h)

HOW THE TWO ROUNDS DIFFER ON THE BeSD BATTERIES -- read this before comparing
2022 and 2023 on any besd19_* / besd21_* variable. In 2022 both batteries were
read out to every caregiver, and "rien, ce n'est pas difficile" (BeSD19_a) /
"rien, vous etes satisfait(e)" (BeSD21_a) were simply two of the options. In
2023 those two options are gone and a filter question was put in front of each
battery instead: the reasons were only asked of the caregivers who answered
that access is difficult (BeSD19 = oui) or that they are not at all satisfied
(BeSD20 = "pas du tout satisfait(e)"). This script therefore

  - reads besd19_aucune_difficulte / besd21_satisfait off BeSD19_a / BeSD21_a
    in 2022 and off the 2023 filter questions (BeSD19 = non, BeSD20 != "pas du
    tout satisfait(e)"), and
  - counts a 2023 child the battery was never read out to as a "no" on each
    reason rather than as a missing value, so every variable keeps the same
    denominator -- all children in the age window -- in both years.

That keeps each year internally consistent, but it does not make the two years
equivalent: 2023 only let the most dissatisfied 5% name a problem, so its
besd21_* rates are structurally far below 2022's. Compare within a year, across
provinces and zones, rather than across years.
"""

from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class Source:
    """Where one indicator's answer sits in one survey file, and how it is coded.

    `yes` and `no` are the source codes counted as 1 and 0; every other code
    (and a blank cell) becomes a missing value, which drops the child from that
    variable's denominator only -- "ne sait pas" is not evidence of "no".

    `gate` names the filter question that decides whether `column` was asked at
    all, as (column, the codes meaning "asked"). A child whose gate answer sits
    outside those codes was skipped by the questionnaire's own routing, so the
    blank cell means "did not report this" -- a 0, not a missing value.
    """

    column: str
    yes: tuple[int, ...]
    no: tuple[int, ...]
    gate: tuple[str, tuple[int, ...]] | None = None


@dataclass(frozen=True)
class Indicator:
    """One yes/no variable and the per-year columns it is built from.

    `sources` is keyed by survey year, with ANY_YEAR as the fallback for the
    years that have no entry of their own. The two ECV rounds re-cut several of
    the BeSD questions (see the module docstring), so the same variable can
    legitimately come from a different column -- or from a filter question --
    depending on the year.
    """

    key: str
    label: str
    sources: Mapping[str, Source]

    def source(self, year: str) -> Source | None:
        return self.sources.get(year) or self.sources.get(ANY_YEAR)


ANY_YEAR = "*"


def every_year(
    column: str,
    yes: tuple[int, ...],
    no: tuple[int, ...],
) -> dict[str, Source]:
    """Same column, same coding, in every survey round."""
    return {ANY_YEAR: Source(column, yes, no)}


def scale_modality(column: str, code: int, scale: tuple[int, ...]) -> dict[str, Source]:
    """One modality of an ordered scale: this code vs every other code.

    Charted as a stacked bar, so the modalities of one question add up to 100%
    of the children who answered it.
    """
    return every_year(column, (code,), tuple(c for c in scale if c != code))


# In 2022 the "why is it difficult / what is the problem" batteries were read
# out to every caregiver. In 2023 they are filtered: only the caregivers who
# said access is difficult (BeSD19 = 1) or that they are not at all satisfied
# (BeSD20 = 1) were asked, so everyone else has a blank cell that means "did
# not report this problem".
GATE_ACCES = ("BeSD19", (1,))
GATE_SATISFACTION = ("BeSD20", (1,))

LIKERT4 = (1, 2, 3, 4)


def reason(column: str, gate: tuple[str, tuple[int, ...]]) -> dict[str, Source]:
    """One option of a multi-select battery: asked of everyone in 2022, gated in 2023."""
    return {
        "2022": Source(column, (1,), (2,)),
        "2023": Source(column, (1,), (2,), gate),
    }


INDICATORS: tuple[Indicator, ...] = (
    # -- Document de vaccination -------------------------------------------
    Indicator(
        "possession_carte",
        "Possession de carte",
        every_year(
            "vs26", (1, 3), (2, 4)
        ),  # 1 = carte seule, 2 = autre document seul, 3 = les deux, 4 = rien
    ),
    Indicator(
        "carte_ou_document", "Carte ou document", every_year("vs26", (1, 2, 3), (4,))
    ),
    # -- Mere / gardienne ---------------------------------------------------
    Indicator("mere", "Mère", every_year("qa100", (1,), (2,))),
    Indicator("gardienne", "Gardienne", every_year("qa100", (2,), (1,))),
    # -- Enregistrement de la naissance -------------------------------------
    Indicator(
        "certificat_naissance",
        "Certificat de naissance",
        every_year(
            "vs25d", (1, 2), (3,)
        ),  # 1 = oui vu, 2 = oui pas vu, 3 = non (8 = ne sait pas -> missing)
    ),
    Indicator(
        "naissance_enregistree",
        "Naissance enregistrée",
        every_year("vs25e", (1,), (2,)),  # 1 = oui, 2 = non (99 = NSP -> missing)
    ),
    # -- BeSD4: importance percue des vaccins -------------------------------
    # 1 = pas du tout, 2 = quelque peu, 3 = moyennement, 4 = tres important
    Indicator(
        "besd4_pas_important",
        "Pas du tout important",
        scale_modality("BeSD4", 1, LIKERT4),
    ),
    Indicator(
        "besd4_peu_important",
        "Quelque peu important",
        scale_modality("BeSD4", 2, LIKERT4),
    ),
    Indicator(
        "besd4_moyen_important",
        "Moyennement important",
        scale_modality("BeSD4", 3, LIKERT4),
    ),
    Indicator(
        "besd4_tres_important", "Très important", scale_modality("BeSD4", 4, LIKERT4)
    ),
    # -- BeSD6: confiance dans les agents de sante --------------------------
    # 1 = aucune, 2 = limitee, 3 = moyenne, 4 = grande confiance.
    Indicator(
        "besd6_aucune_confiance",
        "Aucune confiance",
        scale_modality("BeSD6", 1, LIKERT4),
    ),
    Indicator(
        "besd6_confiance_limitee",
        "Confiance limitée",
        scale_modality("BeSD6", 2, LIKERT4),
    ),
    Indicator(
        "besd6_confiance_moyenne",
        "Confiance moyenne",
        scale_modality("BeSD6", 3, LIKERT4),
    ),
    Indicator(
        "besd6_grande_confiance",
        "Grande confiance",
        scale_modality("BeSD6", 4, LIKERT4),
    ),
    # -- BeSD19: difficultes d'acces (BeSD19_a .. BeSD19_e) -----------------
    # "Aucune difficulte" is its own option in 2022 (BeSD19a) and the "Non"
    # answer of the 2023 filter question (BeSD19); the four reasons follow.
    Indicator(
        "besd19_aucune_difficulte",
        "Aucune difficulté",
        {"2022": Source("BeSD19a", (1,), (2,)), "2023": Source("BeSD19", (2,), (1,))},
    ),
    Indicator("besd19_trajet", "Trajet difficile", reason("BeSD19b", GATE_ACCES)),
    Indicator(
        "besd19_horaires", "Horaires peu pratiques", reason("BeSD19c", GATE_ACCES)
    ),
    Indicator("besd19_refoulement", "Refoulement", reason("BeSD19d", GATE_ACCES)),
    Indicator("besd19_attente", "Attente trop longue", reason("BeSD19e", GATE_ACCES)),
    # -- BeSD20: problemes des services (BeSD21_a .. BeSD21_h) --------------
    # Same shape: "Rien, vous etes satisfait(e)" is BeSD21a in 2022 and, in
    # 2023, every caregiver the BeSD21 battery was not read out to.
    Indicator(
        "besd21_satisfait",
        "Rien, satisfait(e)",
        {
            "2022": Source("BeSD21a", (1,), (2,)),
            "2023": Source("BeSD20", (2, 3, 4), (1,)),
        },
    ),
    Indicator(
        "besd21_rupture", "Vaccin indisponible", reason("BeSD21b", GATE_SATISFACTION)
    ),
    Indicator(
        "besd21_ouverture", "Ouverture tardive", reason("BeSD21c", GATE_SATISFACTION)
    ),
    Indicator(
        "besd21_attente", "Attente trop longue", reason("BeSD21d", GATE_SATISFACTION)
    ),
    Indicator(
        "besd21_proprete", "Manque de propreté", reason("BeSD21e", GATE_SATISFACTION)
    ),
    Indicator(
        "besd21_formation", "Personnel mal formé", reason("BeSD21f", GATE_SATISFACTION)
    ),
    Indicator(
        "besd21_respect",
        "Personnel irrespectueux",
        reason("BeSD21g", GATE_SATISFACTION),
    ),
    Indicator(
        "besd21_temps",
        "Trop peu de temps accordé",
        reason("BeSD21h", GATE_SATISFACTION),
    ),
)

BY_KEY = {ind.key: ind for ind in INDICATORS}
VARIABLES = [ind.key for ind in INDICATORS]

# Variable sets that carve up a single question, one variable per modality, so
# their rates have to add up to 100% of the children who answered it. Checked
# on every run by the pipeline's report_indicators(). The multi-select BeSD19 / BeSD21
# batteries are deliberately absent: a caregiver can pick several options
# there, so those variables overlap and do not sum to anything in particular.
PARTITIONS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("qa100", ("mere", "gardienne")),
    (
        "BeSD4",
        (
            "besd4_pas_important",
            "besd4_peu_important",
            "besd4_moyen_important",
            "besd4_tres_important",
        ),
    ),
    (
        "BeSD6",
        (
            "besd6_aucune_confiance",
            "besd6_confiance_limitee",
            "besd6_confiance_moyenne",
            "besd6_grande_confiance",
        ),
    ),
)


def source_columns(variables: list[str], year: str) -> list[str]:
    """Columns `year`'s file has to provide for `variables`: answers and gates."""
    needed: list[str] = []
    for key in variables:
        src = BY_KEY[key].source(year)
        if src is None:
            continue
        needed.append(src.column)
        if src.gate is not None:
            needed.append(src.gate[0])
    return sorted(set(needed))
