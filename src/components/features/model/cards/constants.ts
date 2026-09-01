import type { MetricKey } from '@/types'

export const PRED_VACCINE_DESCRIPTIONS: Record<MetricKey, { coverage: string; count: string }> = {
    pred_bcg: {
        coverage: "Proportion estimée d'enfants vaccinés par le BCG (vaccin contre la tuberculose)",
        count: "Nombre estimé d'enfants vaccinés par le BCG parmi la population âgée de 6 à 24 mois"
    },
    pred_rota: {
        coverage: "Proportion estimée d'enfants vaccinés contre le rotavirus",
        count: "Nombre estimé d'enfants vaccinés contre le rotavirus parmi la population âgée de 6 à 24 mois"
    },
    pred_var: {
        coverage: "Proportion estimée d'enfants vaccinés contre la rougeole",
        count: "Nombre estimé d'enfants vaccinés contre la rougeole parmi la population âgée de 6 à 24 mois"
    },
    pred_vaa: {
        coverage: "Proportion estimée d'enfants vaccinés contre la fièvre jaune",
        count: "Nombre estimé d'enfants vaccinés contre la fièvre jaune parmi la population âgée de 6 à 24 mois"
    },
    pred_polio: {
        coverage: "Proportion estimée d'enfants vaccinés contre la polio",
        count: "Nombre estimé d'enfants vaccinés contre la polio parmi la population âgée de 6 à 24 mois"
    },
    pred_pcv: {
        coverage: "Proportion estimée d'enfants vaccinés contre le pneumocoque (Streptococcus pneumoniae)",
        count: "Nombre estimé d'enfants vaccinés contre le pneumocoque parmi la population âgée de 6 à 24 mois"
    },
    pred_zerodosepenta: {
        coverage: "Proportion estimée d'enfants n'ayant reçu aucune dose, sur la base du taux de couverture vaccinale par le vaccin pentavalent",
        count: "Nombre estimé d'enfants n'ayant reçu aucune dose (vaccin pentavalent) parmi la population âgée de 6 à 24 mois"
    },
    pred_zerodoseall: {
        coverage: "Proportion estimée d'enfants n'ayant reçu aucune dose, sur la base du taux de couverture vaccinale pour l'ensemble des vaccins",
        count: "Nombre estimé d'enfants n'ayant reçu aucune dose (tous vaccins confondus) parmi la population âgée de 6 à 24 mois"
    }
}