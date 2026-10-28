import type { DeterminantCategory } from '@/types'

// How each household-model covariate is built from the ECV questionnaire,
// transcribed from data/input/immureach/behavior/Table_indicatorsv2.docx.
// Labels match covariates_description.csv so the note reads like the charts.
export interface IndicatorMethod {
  variable: string
  label: string
  questions: string[]
  construction: string
  // Cronbach's alpha / McDonald's omega, or the correlation for two questions.
  consistency?: string
  remark?: string
}

export const INDICATOR_METHODS: Record<DeterminantCategory, IndicatorMethod[]> = {
  Capacity: [
    {
      variable: 'knowledge_diseases',
      label: 'Connaissances maladies',
      questions: [
        'Connaissez-vous les maladies infantiles qui peuvent être évitées par la vaccination ? (tuberculose, diphtérie, coqueluche, hépatite, polio, rougeole, fièvre jaune, tétanos, pneumonie, méningite, diarrhée)',
      ],
      construction: 'Nombre de maladies de la liste citées par la répondante (0 à 11).',
      consistency: 'α = 0,79 ; ω = 0,82',
      remark: 'Toutes les maladies ont le même poids.',
    },
    {
      variable: 'knowledge_vaccines',
      label: 'Connaissances vaccination',
      questions: [
        "Qu'avez-vous entendu sur la vaccination ? (campagnes : dates, âges ciblés ; importance de la vaccination de routine ; où se faire vacciner ; âge des vaccinations de routine ; nécessité de revenir pour les doses suivantes ; nouveaux vaccins pneumocoque et rotavirus)",
      ],
      construction: 'Nombre d’éléments de la liste cités par la répondante (0 à 6).',
      consistency: 'α = 0,72 ; ω = 0,73',
      remark: 'Tous les éléments ont le même poids.',
    },
    {
      variable: 'household_travel_ohe',
      label: 'Déplacements ménages',
      questions: [
        "Au cours de l'année écoulée, des membres du ménage ont-ils vécu ou voyagé ailleurs ?",
        'Si oui : combien de fois, durée du plus long voyage, qui est parti (un adulte, deux adultes ou plus, enfants seuls, enfants et adultes, tout le monde, incertain) ?',
      ],
      construction:
        'Sans déplacement, les questions de suivi sont codées 0 ; « qui est parti » est codé en variables indicatrices. Score = coordonnée du ménage sur le premier axe d’une ACP de toutes les questions.',
      consistency: 'α = 0,79 ; ω = 0,80',
      remark:
        'Les déplacements de la mère ou gardienne sont associés aux opportunités manquées (Salako et al., 2024). Le motif du voyage (famille, vacances, travail) n’est pas utilisé.',
    },
  ],
  Motivation: [
    {
      variable: 'fear_side_effects',
      label: 'Peur effets secondaires',
      questions: [
        'Connaissez-vous des enfants (les vôtres, ceux d’un voisin…) qui ont eu un abcès après une vaccination ?',
        'Connaissez-vous des enfants de votre famille ou communauté ayant eu des problèmes de santé après une vaccination au cours des 12 derniers mois ?',
      ],
      construction: 'Moyenne des deux réponses, posées sur la même échelle de Likert.',
      consistency: 'r = 0,27',
      remark: 'Dimension « Confiance » du modèle des 3C (MacDonald, 2015).',
    },
    {
      variable: 'fear_diseases',
      label: 'Peur maladies',
      questions: [
        'Selon vous, quelle est la gravité des maladies évitables par la vaccination ?',
        'Dans quelle mesure la rougeole menace-t-elle la santé des enfants non vaccinés ?',
      ],
      construction: 'Moyenne des scores z des deux réponses, posées sur deux échelles de Likert différentes.',
      consistency: 'r = 0,68',
      remark: 'Indicateur inverse de la « complaisance » du modèle des 3C : plus la peur est forte, plus la complaisance est faible.',
    },
    {
      variable: 'opinion_on_vaccines',
      label: 'Opinion sur les vaccins',
      questions: [
        'Quelle importance les vaccins ont-ils pour la santé de votre enfant ?',
        'Les vaccins sont-ils sûrs pour votre enfant ?',
        'Dans quelle mesure les vaccins sont-ils bons pour votre enfant ?',
        'Dans quelle mesure les vaccins protègent-ils votre enfant contre les maladies ?',
      ],
      construction: 'Coordonnée sur le premier axe d’une ACP des quatre questions.',
      consistency: 'α = 0,87 ; ω = 0,88',
      remark: 'Questions fortement colinéaires deux à deux. Dimension « Confiance » du modèle des 3C.',
    },
    {
      variable: 'self_efficacy',
      label: 'Confiance propre capacité',
      questions: ['Êtes-vous confiante dans votre capacité à amener votre enfant aux séances de vaccination prévues ?'],
      construction: 'Réponse utilisée telle quelle.',
      remark: 'Croyance d’une personne en sa capacité à agir pour atteindre un objectif (Bandura, 1977).',
    },
    {
      variable: 'compliance_with_procedures',
      label: 'Respect des procédures',
      questions: ['La mère ou gardienne sait-elle comment enregistrer l’enfant à l’état civil ?'],
      construction: 'Réponse utilisée telle quelle.',
    },
  ],
  Opportunity: [
    {
      variable: 'gender_imbalance',
      label: 'Inégalité de genre',
      questions: ['S’il était temps de vacciner l’enfant, sa mère devrait-elle demander la permission pour l’amener au centre de santé ?'],
      construction: 'Réponse utilisée telle quelle.',
      remark: 'Rapports de pouvoir entre les personnes qui s’occupent de l’enfant.',
    },
    {
      variable: 'community_norms',
      label: 'Normes communautaires',
      questions: [
        '10 questions sur la vaccination vue par l’entourage : parents de la communauté, proches et amis, leaders locaux et religieux (approbation, valeur accordée aux services, façon d’en parler, cohérence avec les croyances religieuses).',
      ],
      construction:
        'Coordonnée sur le premier axe d’une ACP. Pour « Comment les gens de votre communauté parlent-ils de la vaccination ? », les réponses « certains en bien, d’autres en mal » et « ne sait pas » sont regroupées.',
      consistency: 'α = 0,86 ; ω = 0,87',
    },
    {
      variable: 'outreach',
      label: 'Sensibilisation',
      questions: [
        'Un professionnel de santé vous a-t-il recommandé de faire vacciner votre enfant ?',
        'Vous a-t-on déjà contactée pour dire que votre enfant devait être vacciné ?',
        'Recevez-vous des visites à domicile d’agents communautaires ?',
      ],
      construction: 'Coordonnée sur le premier axe d’une ACP des trois questions.',
      consistency: 'α = 0,73 ; ω = 0,75',
    },
    {
      variable: 'trust_in_hcw',
      label: 'Confiance personnels santé',
      questions: ['Quel degré de confiance accordez-vous aux agents de santé qui vaccinent les enfants ?'],
      construction: 'Réponse utilisée telle quelle (acceptabilité du centre de santé).',
    },
    {
      variable: 'cultural_alignment',
      label: 'Alignement culturel',
      questions: ['Groupe ethnique du ménage.'],
      construction:
        'Part du groupe ethnique de la répondante dans la zone de santé (acceptabilité). « Groupe ethnique principal » indique si ce groupe y est majoritaire.',
    },
    {
      variable: 'ai_vaccine_dose',
      label: 'Doses de vaccin disponibles / Effectifs médicaux disponibles',
      questions: ['Données DHIS2 (hors ECV) : doses de vaccin et personnel médical des formations sanitaires.'],
      construction: 'Disponibilité spatiale potentielle calculée par une méthode d’aires de chalandise flottantes en 3 étapes (3SFCA) modifiée.',
    },
    {
      variable: 'affordability',
      label: 'Coûts directs',
      questions: ['Avez-vous dû payer la carte de vaccination ou un acte lié à la vaccination ?'],
      construction: 'Pourcentage des ménages de la zone de santé ayant eu ces dépenses directes.',
    },
    {
      variable: 'missed_opportunities',
      label: 'Opportunités manquées',
      questions: [
        'Avez-vous déjà amené un autre enfant au centre de santé pour le vacciner sans qu’il soit vacciné ?',
        'Vous a-t-on déjà renvoyée alors que vous vouliez faire vacciner votre enfant ?',
      ],
      construction: 'Somme des scores z des deux réponses.',
      consistency: 'r = 0,21',
    },
    {
      variable: 'ease_to_vaccinate_children',
      label: 'Facilité de vaccination',
      questions: ['Est-il facile d’obtenir les services de vaccination pour votre enfant ?'],
      construction: 'Réponse utilisée telle quelle.',
    },
  ],
}

// Covariates kept in the model to adjust the estimates, used as recorded.
export const CONTROL_VARIABLES = [
  "âge de l'enfant (mois)",
  "sexe de l'enfant",
  'groupe ethnique',
  'religion et niveau d’éducation de la mère ou gardienne',
  'sexe du chef de famille',
  'quintile de richesse',
]
