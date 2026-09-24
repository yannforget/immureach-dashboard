# Script permettant de processer toutes les enquêtes avec les MEMES règles
# Plus lisible que scripts précédents individuels
# 1. Suppression des doublons
# 2. Suppression des lignes avec problème q103 / coordonnées GPS


library(dplyr)
library(haven) # stata files and format
library(sf)
library(DescTools) # Calcul Gini index
library(FactoMineR) # PCA
library(caret) # One-hot encoding


setwd("data/survey_processed/")

# Fonctions ----
remove_duplicates <- function(dfinput, list_cols){
  dt.doublons <- dfinput %>%
    select(id, any_of(list_cols)) %>%
    group_by(pick(any_of(list_cols))) %>%
    mutate(n = n()) %>%
    filter(n > 1)
  
  id_duplicated_rows <- dt.doublons %>%
    pull(id)
  
  ## Suppression des lignes ----
  
  res <- dfinput %>%
    dplyr::filter(! id %in% id_duplicated_rows)
  
  return(res)
}

trier_doublons_par_cle <- function(indf,
                                   col_id,
                                   regles = rules_for_preprocessing_steps,
                                   col_n_meres = "mere_count",
                                   col_n_enfants = "qa224",
                                   na_est_une_valeur = TRUE,
                                   preserver_ordre = TRUE,
                                   taille_groupe_max = 500L,
                                   retour = c("donnees", "liste")) {
  
  retour <- match.arg(retour)
  stopifnot(is.data.frame(indf), is.character(col_id), length(col_id) == 1L)
  if (!col_id %in% names(indf)) {
    stop("Colonne d'identifiant absente : ", col_id, call. = FALSE)
  }
  if (!all(c("columns_id", "step") %in% names(regles))) {
    stop("`regles` doit contenir les colonnes `columns_id` et `step`.", call. = FALSE)
  }
  
  df <- as.data.frame(indf, stringsAsFactors = FALSE)
  n_lignes_entree <- nrow(df)
  id_chr <- as.character(df[[col_id]])
  
  ## --- Effectif par identifiant ------------------------------------------------
  groupes <- split(seq_len(nrow(df)), id_chr)
  df$n_col_id <- lengths(groupes)[id_chr]
  
  ## --- Colonnes de comparaison -------------------------------------------------
  ## col_id et n_col_id sont constants dans un groupe : ils ne peuvent pas
  ## diverger et n'appartiennent à aucune étape. Les écarter ne change rien au
  ## verdict et évite deux colonnes parasites dans le décompte.
  vars <- setdiff(names(df), c(col_id, "n_col_id"))
  
  etape <- stats::setNames(as.character(regles$step), as.character(regles$columns_id))
  non_mappees <- setdiff(vars, names(etape))

  etape_vars <- unname(etape[vars])          # NA pour les colonnes non mappées
  
  ## --- Codage entier, une seule fois -------------------------------------------
  ## Sert au calcul du minimum sur les paires. Comparer des entiers est bien
  ## plus rapide que comparer des colonnes de types hétérogènes.
  M <- vapply(df[vars], function(col) {
    x <- if (is.numeric(col) || is.logical(col)) col else as.character(col)
    as.integer(factor(x, exclude = if (na_est_une_valeur) NULL else NA))
  }, integer(nrow(df)))
  if (is.null(dim(M))) M <- matrix(M, nrow = nrow(df))
  
  ## --- Une ligne de triage par identifiant dupliqué ----------------------------
  ids_dup <- names(groupes)[lengths(groupes) > 1L]
  
  prop_etape <- function(diverge, etape_vars, cible) {
    k <- which(etape_vars == cible)
    if (!length(k)) return(NA_real_)
    n_div <- sum(diverge[k])
    # NA signifie « aucune divergence dans cette etape » — c'est ce que teste
    # le case_when d'origine avec is.na(prop_*).
    if (n_div == 0L) NA_real_ else n_div / length(k)
  }
  
  min_sur_paires <- function(g) {
    n <- length(g)
    if (n < 2L || n > taille_groupe_max) return(NA_integer_)
    Mg <- M[g, , drop = FALSE]
    meilleur <- Inf
    for (i1 in 1:(n - 1L)) for (i2 in (i1 + 1L):n) {
      a <- Mg[i1, ]; b <- Mg[i2, ]
      d <- if (na_est_une_valeur) {
        sum((is.na(a) != is.na(b)) | (!is.na(a) & !is.na(b) & a != b))
      } else {
        sum(!is.na(a) & !is.na(b) & a != b)
      }
      if (d < meilleur) meilleur <- d
    }
    as.integer(meilleur)
  }
  
  ## Accumulation dans des vecteurs prealloues plutot qu'un data.frame par
  ## groupe : sur quelques milliers d'identifiants, construire autant de
  ## data.frame coute plus cher que tout le reste du calcul.
  n_g <- length(ids_dup)
  v_n_rows      <- integer(n_g)
  v_n_meres     <- rep(NA_real_, n_g)
  v_n_enfants   <- rep(NA_real_, n_g)
  v_n_div       <- integer(n_g)
  v_hh          <- rep(NA_real_, n_g)
  v_mother      <- rep(NA_real_, n_g)
  v_children    <- rep(NA_real_, n_g)
  v_idf         <- rep(NA_real_, n_g)
  v_min_paire   <- rep(NA_integer_, n_g)
  v_incoherent  <- logical(n_g)
  v_manquant    <- logical(n_g)
  
  ## Effectifs attendus : lus une fois pour tout le tableau, pas par groupe.
  lire_col <- function(colonne) {
    if (is.null(colonne) || !colonne %in% names(df)) return(NULL)
    df[[colonne]]
  }
  col_meres   <- lire_col(col_n_meres)
  col_enfants <- lire_col(col_n_enfants)
  
  attendu <- function(colonne, g) {
    if (is.null(colonne)) return(list(valeur = NA_real_, incoherent = FALSE))
    v <- unique(colonne[g])
    v <- v[!is.na(v)]
    if (!length(v)) return(list(valeur = NA_real_, incoherent = FALSE))
    list(valeur = suppressWarnings(as.numeric(v[1])), incoherent = length(v) > 1L)
  }
  
  k_hh       <- which(etape_vars == "household_check")
  k_mother   <- which(etape_vars == "mother_check")
  k_children <- which(etape_vars == "children_check")
  k_idf      <- which(etape_vars == "identification")
  
  prop_etape <- function(diverge, k) {
    if (!length(k)) return(NA_real_)
    n_div <- sum(diverge[k])
    # NA signifie « aucune divergence dans cette etape » — c'est ce que teste
    # le case_when d'origine avec is.na(prop_*).
    if (n_div == 0L) NA_real_ else n_div / length(k)
  }
  
  for (i in seq_len(n_g)) {
    g <- groupes[[ids_dup[i]]]
    n <- length(g)
    v_n_rows[i] <- n
    
    if (n > taille_groupe_max) {
      warning("Identifiant '", ids_dup[i], "' : ", n, " lignes, au-dela de ",
              "taille_groupe_max (", taille_groupe_max, "). Groupe non evalue.",
              call. = FALSE)
      next
    }
    
    ## Divergence par colonne, lue sur la matrice d'entiers : pas de
    ## sous-ensemblage de data.frame, pas de pivot.
    Mg <- M[g, , drop = FALSE]
    diverge <- apply(Mg, 2L, function(v) {
      if (!na_est_une_valeur) v <- v[!is.na(v)]
      length(unique(v)) > 1L
    })
    v_n_div[i] <- sum(diverge)
    
    v_hh[i]       <- prop_etape(diverge, k_hh)
    v_mother[i]   <- prop_etape(diverge, k_mother)
    v_children[i] <- prop_etape(diverge, k_children)
    v_idf[i]      <- prop_etape(diverge, k_idf)
    
    ## Minimum de variables divergentes sur les paires du groupe
    meilleur <- Inf
    for (i1 in 1:(n - 1L)) for (i2 in (i1 + 1L):n) {
      a <- Mg[i1, ]; b <- Mg[i2, ]
      d <- if (na_est_une_valeur) {
        sum((is.na(a) != is.na(b)) | (!is.na(a) & !is.na(b) & a != b))
      } else {
        sum(!is.na(a) & !is.na(b) & a != b)
      }
      if (d < meilleur) meilleur <- d
    }
    v_min_paire[i] <- as.integer(meilleur)
    
    ## Effectifs attendus : premiere valeur, incoherence signalee.
    ## Une LISTE et non un vecteur : c(3, TRUE) coercerait le booleen en
    ## numerique, et isTRUE(1) vaut FALSE — l'incoherence passerait inapercue.
    a_meres   <- attendu(col_meres, g)
    a_enfants <- attendu(col_enfants, g)
    v_n_meres[i]    <- a_meres$valeur
    v_n_enfants[i]  <- a_enfants$valeur
    v_incoherent[i] <- isTRUE(a_meres$incoherent) || isTRUE(a_enfants$incoherent)
    v_manquant[i]   <- is.na(a_meres$valeur) || is.na(a_enfants$valeur)
  }
  
  triage <- if (n_g) data.frame(
    col_id = col_id,
    id = ids_dup,
    i = seq_len(n_g),
    n_rows = v_n_rows,
    n_exp_mothers = v_n_meres,
    n_exp_children = v_n_enfants,
    # Nombre de VARIABLES divergentes (et non de cellules, cf. correction 1).
    n_variables_divergentes = v_n_div,
    n_diverging_rows = v_n_div,          # alias, compatibilite ascendante
    prop_hh_pb = v_hh,
    prop_mother_pb = v_mother,
    prop_children_pb = v_children,
    prop_identification_pb = v_idf,
    n_divergences_min_paire = v_min_paire,
    effectifs_attendus_incoherents = v_incoherent,
    effectifs_attendus_manquants = v_manquant,
    stringsAsFactors = FALSE) else
      
      data.frame(col_id = character(), id = character(), i = numeric(),
                 n_rows = numeric(), n_exp_mothers = numeric(),
                 n_exp_children = numeric(), n_variables_divergentes = numeric(),
                 n_diverging_rows = numeric(), prop_hh_pb = numeric(),
                 prop_mother_pb = numeric(), prop_children_pb = numeric(),
                 prop_identification_pb = numeric(),
                 n_divergences_min_paire = numeric(),
                 effectifs_attendus_incoherents = logical(),
                 effectifs_attendus_manquants = logical(),
                 stringsAsFactors = FALSE)
  
  ## --- Catégorisation — logique inchangée --------------------------------------
  if (nrow(triage)) {
    triage$category <- with(triage, ifelse(
      is.na(prop_hh_pb) & is.na(prop_mother_pb) & is.na(prop_children_pb) &
        is.na(prop_identification_pb),
      "Slice",
      ifelse(
        is.na(prop_hh_pb) & is.na(prop_mother_pb) & !is.na(prop_children_pb) &
          !is.na(n_exp_mothers) & n_exp_mothers < 2 &
          !is.na(n_exp_children) & n_exp_children > 1,
        "OK",
        ifelse(
          is.na(prop_hh_pb) & !is.na(prop_mother_pb) & !is.na(prop_children_pb) &
            !is.na(n_exp_mothers) & n_exp_mothers > 1 &
            !is.na(n_exp_children) & n_exp_children > 1,
          "OK",
          ifelse(
            is.na(prop_hh_pb) & is.na(prop_mother_pb) & !is.na(prop_children_pb) &
              !is.na(n_exp_mothers) & n_exp_mothers > 1 &
              !is.na(n_exp_children) & n_exp_children > 1 & n_rows == n_exp_children,
            "aggregate key mother",
            "To remove")))))
    
    ## Signalement du cas que le critere n_var > 1 classe a tort hors de `Slice`
    a_signaler <- triage$category == "To remove" &
      !is.na(triage$n_divergences_min_paire) & triage$n_divergences_min_paire == 0L
    if (any(a_signaler)) {
      message(sum(a_signaler), " identifiant(s) classe(s) 'To remove' alors ",
              "qu'ils contiennent une PAIRE de lignes strictement identiques. ",
              "Voir n_divergences_min_paire dans la table de triage.")
    }
  } else {
    triage$category <- character()
  }
  
  ## --- Application du verdict ---------------------------------------------------
  id_to_slice  <- triage$id[triage$category == "Slice"]
  id_to_remove <- triage$id[triage$category == "To remove"]
  
  garder <- rep(TRUE, nrow(df))
  garder[id_chr %in% id_to_remove] <- FALSE
  # Pour les identifiants a « trancher », seule la premiere ligne survit.
  for (id_i in id_to_slice) {
    g <- groupes[[id_i]]
    if (length(g) > 1L) garder[g[-1]] <- FALSE
  }
  
  sortie <- df[garder, , drop = FALSE]
  if (!preserver_ordre) {
    sortie <- sortie[order(sortie[[col_id]]), , drop = FALSE]
  }
  rownames(sortie) <- NULL
  
  ## --- Journal --------------------------------------------------------------
  effectifs <- table(triage$category)
  message("Identifiants : ", length(groupes), " dont ", length(ids_dup),
          " a plusieurs lignes.")
  for (n in names(effectifs)) message("  ", n, " : ", effectifs[[n]])
  message("Lignes : ", n_lignes_entree, " en entree, ", nrow(sortie),
          " en sortie (", n_lignes_entree - nrow(sortie), " retirees).")
  
  attr(sortie, "triage") <- triage
  attr(sortie, "colonnes_non_mappees") <- non_mappees
  
  if (identical(retour, "liste")) {
    list(donnees = sortie, triage = triage, colonnes_non_mappees = non_mappees)
  } else {
    sortie
  }
}

remove_duplicates_based_on_answers <- function(indf,
                                               rules = rules_for_preprocessing_steps){
  
  ## sur la base des informations survey x foyers x mere x enfant
  col_for_check_duplicates_all <- rules %>% 
    filter(! step %in% c("identification")) %>%
    filter(columns_id != "KEY_Household") %>%
    pull(columns_id)
  
  survey.keys.d.hh.i <- indf %>%
    group_by(pick(any_of(col_for_check_duplicates_all))) %>%
    mutate(n_cols = n(),
           cur_group_id = cur_group_id()) %>%
    ungroup() %>%
    group_by(KEY_Household, KEY_Mother, KEY_Child) %>%
    mutate(n_key = n()) %>%
    ungroup() 
  
  table(survey.keys.d.hh.i$n_cols, survey.keys.d.hh.i$n_key)
  
  ## Vérification des doublons sur la base des informations foyers x mere x enfant
  col_for_check_duplicates_all_2 <- rules %>% 
    filter(! step %in% c("identification", "survey_technical_details")) %>%
    filter(columns_id != "KEY_Household") %>%
    pull(columns_id)
  
  survey.keys.d.hh.i2 <- survey.keys.d.hh.i %>%
    group_by(pick(any_of(col_for_check_duplicates_all_2))) %>%
    mutate(n_cols = n(),
           cur_group_id = cur_group_id()) %>%
    ungroup() %>%
    group_by(KEY_Household, KEY_Mother, KEY_Child) %>%
    mutate(n_key = n()) %>%
    ungroup() 
  
  # Si divergence : seule différence entre les lignes sont les informations techniques
  # de l'enquête
  table(survey.keys.d.hh.i2$n_cols, survey.keys.d.hh.i2$n_key)
  
  check <- survey.keys.d.hh.i2 %>%
    filter(n_cols > 1) %>%
    select(cur_group_id, KEY_Household, everything()) %>%
    filter(cur_group_id == 3827)
  
  # Garder une ligne par groupe
  survey.keys.d.hh.i3 <- survey.keys.d.hh.i2 %>%
    group_by(cur_group_id) %>%
    slice(1) %>%
    ungroup()
  
  # Vérification des doublons sur la base des informations foyers x mere
  col_for_check_duplicates_all_3 <- rules %>% 
    filter(! step %in% c("identification", "survey_technical_details", "children_check")) %>%
    filter(columns_id != "KEY_Household") %>%
    pull(columns_id)
  
  survey.keys.d.hh.i4 <- survey.keys.d.hh.i3 %>%
    group_by(pick(any_of(col_for_check_duplicates_all_3))) %>%
    mutate(n_cols = n(),
           cur_group_id = cur_group_id()) %>%
    ungroup() %>%
    group_by(KEY_Household, KEY_Mother, KEY_Child) %>%
    mutate(n_key = n()) %>%
    ungroup() 
  
  table(survey.keys.d.hh.i4$n_cols, survey.keys.d.hh.i4$n_key)
  
  
  check2 <- survey.keys.d.hh.i4 %>%
    filter(n_cols > 1) %>%
    select(cur_group_id, KEY_Household, KEY_Mother, KEY_Child, everything()) 
  
  check2.b <- check2 %>%
    filter(cur_group_id == 33769)
  
  check2.b$KEY_Mother
  
  # Suppression si pas même clef foyer
  survey.keys.d.hh.i5 <- survey.keys.d.hh.i4 %>%
    group_by(cur_group_id) %>%
    mutate(same_key_hh = length(unique(KEY_Household)) == 1) %>%
    ungroup() %>%
    filter(n_cols == 1 | (n_cols > 1 & same_key_hh == T))
  
  # Vérification avec juste informations foyer
  col_for_check_duplicates_all_4 <- rules %>% 
    filter(! step %in% c("identification", "survey_technical_details", 
                         "mother_check", "children_check")) %>%
    filter(columns_id != "KEY_Household") %>%
    pull(columns_id)
  
  survey.keys.d.hh.i6 <- survey.keys.d.hh.i5 %>%
    group_by(pick(any_of(col_for_check_duplicates_all_4))) %>%
    mutate(n_cols = n(),
           cur_group_id = cur_group_id()) %>%
    ungroup() %>%
    group_by(KEY_Household, KEY_Mother, KEY_Child) %>%
    mutate(n_key = n()) %>%
    ungroup() 
  
  table(survey.keys.d.hh.i6$n_cols, survey.keys.d.hh.i6$n_key)
  
  
  # Suppression si pas même clef foyer
  survey.keys.d.hh.i7 <- survey.keys.d.hh.i6 %>%
    group_by(cur_group_id) %>%
    mutate(same_key_hh = length(unique(KEY_Household)) == 1) %>%
    ungroup() %>%
    filter(! (n_cols > 1 & same_key_hh == F))
  
  table(survey.keys.d.hh.i7$n_cols, survey.keys.d.hh.i7$n_key)
  
  return(survey.keys.d.hh.i7)
}

au_moins_une_dose <- function(df, cols) {
  mat <- df %>% dplyr::select(all_of(cols))
  une_dose <- rowSums(mat == 1, na.rm = TRUE) > 0
  tout_renseigne <- rowSums(is.na(mat)) == 0
  dplyr::case_when(
    une_dose ~ TRUE,
    !une_dose & tout_renseigne ~ FALSE,
    TRUE ~ NA
  )
}

# Zéro-dose penta (DTC1/Penta1), seule définition utilisée dans tout le script.
calculer_zero_dose_penta <- function(carnet, dtc1, vs76) {
  case_when(
    carnet %in% TRUE  & dtc1 == 1   ~ 0,
    carnet %in% TRUE  & dtc1 != 1   ~ 1,
    carnet %in% TRUE  & is.na(dtc1) ~ NA_real_,
    carnet %in% FALSE & vs76 == 1   ~ 0,
    carnet %in% FALSE & vs76 != 1   ~ 1,
    # HYPOTHESE A VALIDER : en l'absence de carnet ET de déclaration sur le
    # penta, l'enfant est classé zéro-dose 
    carnet %in% FALSE & is.na(vs76) ~ 1,
    is.na(carnet) ~ NA_real_,
    TRUE ~ NA_real_
  )
}

calculer_n_dose_penta_declaration <- function(vs77) {
  ifelse(vs77 %in% c(0, 1, 2, 3), vs77, NA_real_)
}


compute_variables_reponses <- function(indf){
  
  # Pentavalent / zéro-doses (définition GAVI) ----
  col_vaccins_carnet <- c("bcg", "vpob1", "vpob2", "vpob3", "vpi", "vpi2", "dtc_hepb_hib1",
                          "dtc_hepb_hib2", "dtc_hepb_hib3", "pneumo1", "pneumo2",
                          "pneumo3", "rotavirus1", "rotavirus2", "rotavirus3", "var",
                          "vaa")
  
  col_vaccins_declaration <- c("vs71", "vs73", "vs76", "vs78", "vs80", "vs86", "vs83")
  
  penta_cols_carnet <- c("dtc_hepb_hib1", "dtc_hepb_hib2", "dtc_hepb_hib3")
  polio_cols_carnet <- c("vpob1", "vpob2", "vpob3", "vpi", "vpi2")
  polio_cols_declaration <- c("vs73", # goutte ?
                              "vs74")
  rota_cols_carnet <- c("rotavirus1", "rotavirus2", "rotavirus3")
  rota_cols_declaration <- c("vs87")
  pcv_cols_carnet <- c("pneumo1", "pneumo2", "pneumo3")
  pcv_cols_declaration <- c("vs79")
  var_cols_carnet <- c("var", "var2")
  
  all_vacs_cols_carnet <- c("bcg", polio_cols_carnet, penta_cols_carnet,
                            pcv_cols_carnet, rota_cols_carnet, var_cols_carnet)
  
  
  ecvs.penta <- indf %>%
    mutate(zero_dose_penta = calculer_zero_dose_penta(carnet_de_sante_disponible, dtc_hepb_hib1, vs76)) %>%
    mutate(
      au_moins_une_dose_carnet = au_moins_une_dose(., col_vaccins_carnet),
      au_moins_une_dose_declaration = au_moins_une_dose(., col_vaccins_declaration)
    ) %>%
    mutate(zero_dose_all = case_when(
      carnet_de_sante_disponible %in% TRUE  & au_moins_une_dose_carnet %in% TRUE  ~ 0,
      carnet_de_sante_disponible %in% TRUE  & au_moins_une_dose_carnet %in% FALSE ~ 1,
      carnet_de_sante_disponible %in% TRUE  & is.na(au_moins_une_dose_carnet)     ~ NA_real_,
      carnet_de_sante_disponible %in% FALSE & au_moins_une_dose_declaration %in% TRUE  ~ 0,
      carnet_de_sante_disponible %in% FALSE & au_moins_une_dose_declaration %in% FALSE ~ 1,
      # HYPOTHESE A VALIDER : même choix conservateur que pour zero_dose_penta.
      carnet_de_sante_disponible %in% FALSE & is.na(au_moins_une_dose_declaration) ~ 1,
      is.na(carnet_de_sante_disponible) ~ NA_real_,
      TRUE ~ NA_real_
    )) %>%
    mutate(vaccinated_penta = case_when(
      carnet_de_sante_disponible %in% TRUE  & dtc_hepb_hib3 == 1 ~ 1,
      carnet_de_sante_disponible %in% TRUE  & (dtc_hepb_hib3 != 1 | is.na(dtc_hepb_hib3)) ~ 0,
      carnet_de_sante_disponible %in% FALSE & vs76 == 1 & vs77 == 3 ~ 1,
      carnet_de_sante_disponible %in% FALSE & vs76 == 1 & vs77 %in% c(0, 1, 2) ~ 0,
      carnet_de_sante_disponible %in% FALSE & vs76 == 1 & is.na(vs77) ~ NA_real_,
      carnet_de_sante_disponible %in% FALSE & vs76 != 1 ~ 0,
      carnet_de_sante_disponible %in% FALSE & is.na(vs76) ~ NA_real_,
      # A FAIRE : FOSA (statut vaccinal via formation sanitaire, non traité)
      is.na(carnet_de_sante_disponible) ~ NA_real_,
      TRUE ~ NA_real_
    )) %>%
    dplyr::select(id, zero_dose_penta, zero_dose_all, vaccinated_penta)
  
  
  # Drop-out penta ----
  ecvs.dropoutpenta <- indf %>%
    mutate(n_dose_penta_carnet = rowSums(across(all_of(penta_cols_carnet)) == 1, na.rm = TRUE)) %>%
    mutate(n_dose_penta_declaration = calculer_n_dose_penta_declaration(vs77)) %>%
    mutate(n_doses_penta = case_when(
      carnet_de_sante_disponible %in% TRUE  ~ n_dose_penta_carnet,
      carnet_de_sante_disponible %in% FALSE & !is.na(n_dose_penta_declaration) ~ n_dose_penta_declaration,
      carnet_de_sante_disponible %in% FALSE & vs70 == 2 ~ 0, # Déclare ne pas avoir reçu de vaccins
      carnet_de_sante_disponible %in% FALSE & vs76 == 2 ~ 0, # Déclare ne pas avoir reçu le vaccin penta
      TRUE ~ NA_real_
    )) %>%
    mutate(zero_dose_penta = calculer_zero_dose_penta(carnet_de_sante_disponible, dtc_hepb_hib1, vs76)) %>%
    # Statut : pas de dose, pas de penta3 sachant que penta1, penta3 sachant que penta1
    mutate(drop_out_penta = case_when(
      carnet_de_sante_disponible %in% TRUE  & n_dose_penta_carnet == 3 ~ "penta3_sachant_penta1",
      carnet_de_sante_disponible %in% TRUE  & n_dose_penta_carnet %in% c(1, 2) ~ "no_penta3_sachant_penta1",
      carnet_de_sante_disponible %in% TRUE  & n_dose_penta_carnet == 0 ~ "zero_dose",
      
      carnet_de_sante_disponible %in% FALSE & n_dose_penta_declaration == 3 ~ "penta3_sachant_penta1",
      carnet_de_sante_disponible %in% FALSE & n_dose_penta_declaration %in% c(1, 2) ~ "no_penta3_sachant_penta1",
      carnet_de_sante_disponible %in% FALSE & vs76 == 2 ~ "zero_dose", # Déclare ne pas avoir reçu le vaccin penta
      carnet_de_sante_disponible %in% FALSE & vs70 == 2 ~ "zero_dose", # Déclare ne pas avoir reçu de vaccins
      zero_dose_penta == 1 ~ "zero_dose",
      TRUE ~ "undetermined_to_remove"
    ))
  
  
  check_dropout <- ecvs.dropoutpenta %>%
    filter(drop_out_penta == "undetermined_to_remove") %>%
    dplyr::select(id, zero_dose_penta, vs70, vs76, vs77, vs71, vs72, vs74)
  
  ecvs.dropoutpenta <- ecvs.dropoutpenta %>%
    dplyr::select(id, drop_out_penta, n_doses_penta)
  
  
  # Drop out pour rougeole (VAR) ----
  # Nettoyage des données : si pas de valeur de dose égale à 1 ou 2, considérée
  # comme indéterminée et pas utilisée dans les modèles.
  # Très conservateur mais plus facile à justifier.
  ecvs.dropoutrougeole <- indf %>%
    mutate(n_dose_var_carnet = rowSums(across(all_of(var_cols_carnet)) == 1, na.rm = TRUE)) %>%
    mutate(n_dose_var_declaration = ifelse(vs81 %in% c(1, 2), vs81, NA_real_)) %>%
    mutate(zero_dose_penta = calculer_zero_dose_penta(carnet_de_sante_disponible, dtc_hepb_hib1, vs76)) %>%
    mutate(drop_out_var = case_when(
      carnet_de_sante_disponible %in% TRUE  & n_dose_var_carnet == 2 ~ "VAR2_sachant_VAR1",
      carnet_de_sante_disponible %in% TRUE  & n_dose_var_carnet == 1 ~ "no_VAR2_sachant_VAR1",
      carnet_de_sante_disponible %in% TRUE  & n_dose_var_carnet == 0 ~ "zero_dose",
      
      carnet_de_sante_disponible %in% FALSE & n_dose_var_declaration == 2 ~ "VAR2_sachant_VAR1",
      carnet_de_sante_disponible %in% FALSE & n_dose_var_declaration == 1 ~ "no_VAR2_sachant_VAR1",
      carnet_de_sante_disponible %in% FALSE & vs76 == 2 ~ "zero_dose",
      carnet_de_sante_disponible %in% FALSE & vs70 == 2 ~ "zero_dose",
      zero_dose_penta == 1 ~ "zero_dose",
      carnet_de_sante_disponible %in% FALSE & (vs80 == 2 | vs80 == 99) ~ "zero_dose",
      carnet_de_sante_disponible %in% FALSE & is.na(n_dose_var_declaration) ~ "undetermined_to_remove",
      TRUE ~ "undetermined_to_remove2"
    ))
  
  check_dropout_var <- ecvs.dropoutrougeole %>%
    filter(drop_out_var == "undetermined_to_remove2") %>%
    dplyr::select(id, vs25, vs70, vs71, vs73, all_of(col_vaccins_declaration), vs81) %>%
    mutate(age = ifelse(vs25 > 15, "sup15", "inf15")) %>%
    count(vs80, age, vs81, vs71, vs73)
  
  
  ecvs.dropoutrougeole <- ecvs.dropoutrougeole %>%
    dplyr::select(id, drop_out_var)
  
  
  # Nombre de doses pour tous les vaccins (hors penta) ----
  ecvs.n_doses <- indf %>%
    # Polio
    mutate(n_dose_polio_carnet = rowSums(across(all_of(polio_cols_carnet)) == 1, na.rm = TRUE)) %>%
    mutate(n_dose_polio_declaration = ifelse(vs74 %in% c(0:5), vs74, NA_real_)) %>%
    mutate(n_doses_polio = case_when(
      carnet_de_sante_disponible %in% TRUE  ~ n_dose_polio_carnet,
      carnet_de_sante_disponible %in% FALSE ~ n_dose_polio_declaration
    )) %>%
    # Rota
    mutate(n_dose_rota_carnet = rowSums(across(all_of(rota_cols_carnet)) == 1, na.rm = TRUE)) %>%
    mutate(n_dose_rota_declaration = case_when(
      vs86 == 2 ~ 0, # N'a pas reçu ce vaccin
      vs86 == 1 & vs87 %in% 1:3 ~ vs87,
      vs70 == 2 ~ 0, # N'a pas reçu de vaccins
      TRUE ~ NA_real_
    )) %>%
    mutate(n_doses_rota = case_when(
      carnet_de_sante_disponible %in% TRUE  ~ n_dose_rota_carnet,
      carnet_de_sante_disponible %in% FALSE ~ n_dose_rota_declaration
    )) %>%
    # PCV
    mutate(n_dose_pcv_carnet = rowSums(across(all_of(pcv_cols_carnet)) == 1, na.rm = TRUE)) %>%
    mutate(n_dose_pcv_declaration = case_when(
      vs78 == 2 ~ 0,
      vs78 == 1 & vs79 %in% 1:3 ~ vs79,
      vs70 == 2 ~ 0,
      TRUE ~ NA_real_
    )) %>%
    mutate(n_doses_pcv = case_when(
      carnet_de_sante_disponible %in% TRUE  ~ n_dose_pcv_carnet,
      carnet_de_sante_disponible %in% FALSE ~ n_dose_pcv_declaration
    )) %>%
    # ALL
    mutate(n_dose_ALL_carnet = rowSums(across(all_of(all_vacs_cols_carnet)) == 1, na.rm = TRUE)) %>%
    mutate(
      n_dose_var_declaration = ifelse(vs81 %in% c(1, 2), vs81, NA_real_),
      n_dose_vaa_declaration = ifelse(vs83 == 1, 1, NA_real_),
      n_dose_penta_declaration = calculer_n_dose_penta_declaration(vs77),
      n_dose_bcg_declaration = ifelse(vs71 == 1, 1, 0)
    ) %>%
    mutate(n_dose_ALL_declaration = case_when(
      vs70 == 2 ~ 0, # N'a pas reçu de vaccins
      vs70 == 1 ~ rowSums(across(all_of(c(
        "n_dose_var_declaration", "n_dose_vaa_declaration", "n_dose_bcg_declaration",
        "n_dose_penta_declaration", "n_dose_polio_declaration", "n_dose_rota_declaration",
        "n_dose_pcv_declaration"
      ))), na.rm = TRUE),
      TRUE ~ NA_real_
    )) %>%
    mutate(n_doses_ALL = case_when(
      carnet_de_sante_disponible %in% TRUE  ~ n_dose_ALL_carnet,
      carnet_de_sante_disponible %in% FALSE ~ n_dose_ALL_declaration
    )) %>%
    dplyr::select(id, carnet_de_sante_disponible,
                  n_doses_polio, n_doses_rota,
                  n_doses_pcv, n_doses_ALL)
  
  # Uptake par vaccin (au moins une dose, schéma pas forcément complet) ----
  ecvs.uptake <- indf %>%
    # BCG
    mutate(bcg_uptake = case_when(
      carnet_de_sante_disponible %in% TRUE  & bcg == 1 ~ 1,
      carnet_de_sante_disponible %in% TRUE  & bcg == 2 ~ 0,
      carnet_de_sante_disponible %in% FALSE & vs71 == 1 ~ 1, # Sur la base de la déclaration
      carnet_de_sante_disponible %in% FALSE & vs72 == 1 ~ 1, # Cicatrice présente
      carnet_de_sante_disponible %in% FALSE & vs71 == 2 & vs72 != 1 ~ 0,
      carnet_de_sante_disponible %in% FALSE & is.na(vs71) & is.na(vs72) & vs70 == 2 ~ 0,
      TRUE ~ NA_real_
    )) %>%
    # Polio
    mutate(n_dose_polio_carnet = rowSums(across(all_of(polio_cols_carnet)) == 1, na.rm = TRUE)) %>%
    mutate(polio_uptake = case_when(
      carnet_de_sante_disponible %in% TRUE  & n_dose_polio_carnet > 0 ~ 1,
      carnet_de_sante_disponible %in% TRUE  & n_dose_polio_carnet == 0 ~ 0,
      carnet_de_sante_disponible %in% FALSE & vs70 == 2 ~ 0,
      carnet_de_sante_disponible %in% FALSE & vs73 == 1 ~ 1,
      carnet_de_sante_disponible %in% FALSE & vs73 == 2 & vs74a == 2 ~ 0,
      carnet_de_sante_disponible %in% FALSE & vs73 == 2 ~ 0,
      carnet_de_sante_disponible %in% FALSE & vs74a == 1 ~ 1, # Négatif sur polio mais gouttes+injections déjà reçues
      TRUE ~ NA_real_ # inclut explicitement vs70 == 99 (ne sait pas)
    )) %>%
    # Penta
    mutate(n_dose_penta_carnet = rowSums(across(all_of(penta_cols_carnet)) == 1, na.rm = TRUE)) %>%
    mutate(penta_uptake = case_when(
      carnet_de_sante_disponible %in% TRUE  & n_dose_penta_carnet > 0 ~ 1,
      carnet_de_sante_disponible %in% TRUE  & n_dose_penta_carnet == 0 ~ 0,
      carnet_de_sante_disponible %in% FALSE & vs76 == 1 ~ 1,
      carnet_de_sante_disponible %in% FALSE & vs76 != 1 ~ 0,
      carnet_de_sante_disponible %in% FALSE & vs70 == 2 ~ 0,
      TRUE ~ NA_real_
    )) %>%
    # PCV
    mutate(n_dose_pcv_carnet = rowSums(across(all_of(pcv_cols_carnet)) == 1, na.rm = TRUE)) %>%
    mutate(pcv_uptake = case_when(
      carnet_de_sante_disponible %in% TRUE  & n_dose_pcv_carnet > 0 ~ 1,
      carnet_de_sante_disponible %in% TRUE  & n_dose_pcv_carnet == 0 ~ 0,
      carnet_de_sante_disponible %in% FALSE & vs78 == 1 ~ 1,
      carnet_de_sante_disponible %in% FALSE & vs78 != 1 ~ 0,
      carnet_de_sante_disponible %in% FALSE & vs70 == 2 ~ 0,
      TRUE ~ NA_real_
    )) %>%
    # Rotavirus
    mutate(n_dose_rota_carnet = rowSums(across(all_of(rota_cols_carnet)) == 1, na.rm = TRUE)) %>%
    mutate(rota_uptake = case_when(
      carnet_de_sante_disponible %in% TRUE  & n_dose_rota_carnet > 0 ~ 1,
      carnet_de_sante_disponible %in% TRUE  & n_dose_rota_carnet == 0 ~ 0,
      carnet_de_sante_disponible %in% FALSE & vs86 == 1 ~ 1,
      carnet_de_sante_disponible %in% FALSE & vs86 != 1 ~ 0,
      carnet_de_sante_disponible %in% FALSE & vs70 == 2 ~ 0,
      TRUE ~ NA_real_
    )) %>%
    # Rougeole (VAR)
    mutate(var_uptake = case_when(
      carnet_de_sante_disponible %in% TRUE  & var == 1 ~ 1,
      carnet_de_sante_disponible %in% TRUE  & var != 1 ~ 0,
      carnet_de_sante_disponible %in% FALSE & vs80 == 1 ~ 1,
      carnet_de_sante_disponible %in% FALSE & vs80 != 1 ~ 0,
      carnet_de_sante_disponible %in% FALSE & vs70 == 2 ~ 0,
      TRUE ~ NA_real_
    )) %>%
    # Fièvre jaune (VAA)
    mutate(vaa_uptake = case_when(
      carnet_de_sante_disponible %in% TRUE  & vaa == 1 ~ 1,
      carnet_de_sante_disponible %in% TRUE  & vaa != 1 ~ 0,
      carnet_de_sante_disponible %in% FALSE & vs83 == 1 ~ 1,
      carnet_de_sante_disponible %in% FALSE & vs83 != 1 ~ 0,
      carnet_de_sante_disponible %in% FALSE & vs70 == 2 ~ 0,
      TRUE ~ NA_real_
    ))
  
  extract_info_vaccine_uptake <- function(df_complet, vaccine_name) {
    cols <- switch(vaccine_name,
                   bcg   = c("carnet_de_sante_disponible", "vs70", "vs71", "vs72", "bcg_uptake"),
                   rota  = c("carnet_de_sante_disponible", "vs70", "vs86", "vs87", "rota_uptake"),
                   pcv   = c("carnet_de_sante_disponible", "vs70", "vs78", "vs79", "pcv_uptake"),
                   penta = c("carnet_de_sante_disponible", "vs70", "vs76", "vs77", "penta_uptake"),
                   polio = c("carnet_de_sante_disponible", "vs70", "vs73", "vs74", "vs74a", "polio_uptake"),
                   var   = c("carnet_de_sante_disponible", "vs70", "var", "vs80", "vs81", "vs80a", "var_uptake"),
                   vaa   = c("carnet_de_sante_disponible", "vaa", "vs70", "vs83", "vs84", "vaa_uptake"),
                   stop("vaccine_name inconnu : ", vaccine_name)
    )
    uptake_col <- cols[length(cols)]
    
    df_complet %>%
      dplyr::select(all_of(cols)) %>%
      st_drop_geometry() %>%
      group_by_all() %>%
      summarise(n = n(), .groups = "drop") %>%
      filter(is.na(.data[[uptake_col]]))
  }
  
  dt.bcg   <- extract_info_vaccine_uptake(ecvs.uptake, "bcg")
  dt.rota  <- extract_info_vaccine_uptake(ecvs.uptake, "rota")
  dt.pcv   <- extract_info_vaccine_uptake(ecvs.uptake, "pcv")
  dt.penta <- extract_info_vaccine_uptake(ecvs.uptake, "penta")
  dt.polio <- extract_info_vaccine_uptake(ecvs.uptake, "polio") # REVOIR POUR vs73
  dt.var   <- extract_info_vaccine_uptake(ecvs.uptake, "var")
  dt.vaa   <- extract_info_vaccine_uptake(ecvs.uptake, "vaa")
  
  
  # Quel lien entre les enfants sans infos et le statut zéro-dose ?
  # 1062 enfants sans infos : quel statut pour les autres variables réponses ?
  # Age non déterminant.
  ecvs.uptake.check <- ecvs.uptake %>%
    filter(is.na(rota_uptake) & vs70 == 99) %>%
    dplyr::select(id, ecv, vs25, carnet_de_sante_disponible, matches("uptake")) %>%
    left_join(ecvs.penta, by = "id")
  
  # Considérés comme zéro-doses, mais pas d'infos en fait ??
  ecvs.uptake <- ecvs.uptake %>%
    mutate(to_remove_brt = is.na(rota_uptake) & vs70 == 99) %>%
    dplyr::select(id, matches("uptake"), to_remove_brt)
  
  # Mise en forme du tableau complet ----
  ecvs.export <- indf %>%
    dplyr::select(id) %>%
    left_join(ecvs.n_doses, by = "id") %>%
    left_join(ecvs.penta, by = "id") %>%
    left_join(ecvs.dropoutpenta, by = "id") %>%
    left_join(ecvs.dropoutrougeole, by = "id") %>%
    left_join(ecvs.uptake, by = "id") %>%
    filter(to_remove_brt == F) %>% select(- to_remove_brt)
  
  return(ecvs.export)
}

compute_covariables_ECV_HZ_level <- function(indf,
                                             pyramide_sanitaire = NULL) {
  
  ecvs <- indf %>%
    group_by(ecv, q101, q103) %>%
    mutate(ponderation_ZS = sum(ponderation)) %>%
    ungroup() 
  
  
  abr_provinces <- data.frame(province = c("Bas Uele", "Equateur", "Haut Katanga", 
                                           "Haut Lomami", "Haut Uele", "Ituri", 
                                           "Kongo Central", "Kasai Oriental", "Kwango", 
                                           "Kwilu", "Kinshasa", "Kasai Central", "Kasai", "Lualaba", "Lomami",
                                           "Maindombe", "Mongala", "Maniema", "Nord Kivu", "Nord Ubangi", "Sud Kivu",
                                           "Sankuru", "Sud Ubangi", "Tanganyika", "Tshopo", "Tshuapa"),
                              abbreviation = c("bu", "eq", "hk", "hl", "hu", "it",
                                               "kc", "ke", "kg", "kl", "kn", "kr", 
                                               "ks", "ll", "lm", "md", "mg", "mn",
                                               "nk", "nu", "sk", "sn", "su", "tn", 
                                               "tp", "tu"))
  
  ## Milieu de localisation du ménage (rural / urbain) GHSL ----
  # Script : processing_GHSL.R
  ecvs.urbain.ghsl <- readRDS("other_data/perc_urban_area_per_zs.rds") %>%
    select(q103, perc_urban_2020) %>%
    mutate(ecv = "2021_2022_2023") %>%
    tidyr::separate_longer_delim(ecv, "_") 
  
  ## Milieu de localisation du ménage (rural / urbain) ECV ----
  # 1: urbain
  # 2: rural
  
  ecvs.urbain <- ecvs %>%
    dplyr::select(ecv, q101, q103, q108) %>%
    group_by(ecv, q101, q103) %>%
    mutate(n_zs = n()) %>%
    ungroup() %>% group_by(ecv, q101, q103, q108) %>%
    summarise(prop_q108 = n() / unique(n_zs)) %>%
    ungroup() %>%
    tidyr::pivot_wider(names_from = q108, values_from = prop_q108,
                       values_fill = 0) %>%
    dplyr::select(- `2`) %>%
    dplyr::rename(prop_urbain = `1`)
  
  
  ## Religion - par pourcentage ----
  code_religion <- data.frame(code = c(1, 2, 3, 4, 5, 6, 8, 9, 7),
                              label = c("Pas de religion", "Catholique", "Protestante", 
                                        "Kimbanguiste", "Musulmane", "Eglise de réveil/indépendante", 
                                        "Ne sait pas", "Pas de réponse", "Autre religion"))
  
  # avec pondération
  ecvs.religion.perc <- ecvs %>%
    dplyr::select(ecv, q101, q103, qa106, qa207, ponderation_ZS, ponderation) %>%
    zap_labels %>%
    mutate(row_id = 1:n()) %>%
    tidyr::pivot_longer(cols = c("qa106", "qa207"), names_to = "ind", values_to = "religion") %>%
    group_by(ecv, q101, q103, ponderation_ZS, religion) %>%
    summarise(n_weighted = sum(ponderation)/2) %>%
    ungroup() %>%
    group_by(ecv, q101, q103) %>%
    mutate(prop = n_weighted / ponderation_ZS) %>%
    mutate(check = sum(prop)) %>%
    ungroup() %>%
    left_join(code_religion, by=c(religion = "code")) %>%
    mutate(label_for_col = gsub(" |[/]", "_", label)) 
  
  # Gini index
  ecvs.religion.gini <- ecvs.religion.perc %>%
    tidyr::pivot_wider(id_cols = c("ecv", "q101", "q103"), 
                       names_prefix = "religion_",
                       names_from = label_for_col, values_from = prop, values_fill = 0) %>%
    tidyr::pivot_longer(cols = c(starts_with("religion")), names_to = "religion", values_to = "prop") %>%
    # Plus de détail sur calcul dans section "ethnie"
    group_by(ecv, q101, q103) %>%
    mutate(religion_gini = Gini(x = prop, unbiased = T, conf.level = NA)) %>%
    ungroup()
  
  
  ecvs.religion.perc.zs <- ecvs.religion.gini %>%
    tidyr::pivot_wider(id_cols = c("ecv", "q101", "q103", "religion_gini"), 
                       names_from = religion, values_from = prop, values_fill = 0) 
  
  
  
  ## Ethnie - par pourcentage ----
  code_ethnie <- data.frame(code = c(1, 2, 3, 4, 5),
                            label = c("Luba", "Kongo", "Swahili", "Mungala", "Autre"))
  
  ecvs.ethnie.perc.per_ecv <- ecvs %>%
    dplyr::select(ecv, q101, q103, qa208, ponderation_ZS, ponderation) %>%
    zap_labels %>%
    group_by_all() %>%
    summarise(n_ethnie_par_poids = n()) %>%
    ungroup() %>%
    mutate(n_ethnie_pondere = ponderation * n_ethnie_par_poids) %>%
    group_by(ecv, q101, q103, qa208, ponderation_ZS) %>%
    summarise(n_ethnie_pondere_comp = sum(n_ethnie_pondere)) %>%
    mutate(perce_ethnie_pondere = n_ethnie_pondere_comp / ponderation_ZS) %>%
    left_join(code_ethnie, by=c(qa208 = "code")) %>%
    ungroup() %>%
    mutate(label = paste("ethnie", label, sep = "_")) 
  
  
  # Gini index
  ecvs.ethnie.gini <- ecvs.ethnie.perc.per_ecv %>%
    tidyr::pivot_wider(id_cols = c("ecv", "q101", "q103"), 
                       names_from = label, values_from = perce_ethnie_pondere, values_fill = 0) %>%
    tidyr::pivot_longer(cols = c(starts_with("ethnie")), names_to = "ethnie", values_to = "prop") %>%
    group_by(ecv, q101, q103) %>%
    # Pas de poids = les proportions (ou nombres d'individus pour chaque ethnie) 
    # sont déjà corrigés par pondération attribuée lors de l'échantillonnage
    # pivot_wider puis pivot_longer pour avoir pour chaque zone des santé les 5 
    # possibilités (même si à 0) : permet de comparer des choses comparables entre les zones de santé
    mutate(ethnie_gini = Gini(x = prop, # Même résultat avec n_ethnie_pondere_comp
                              unbiased = T, conf.level = NA)) %>%
    ungroup()
  
  ecvs.ethnie.zs <- ecvs.ethnie.gini %>%
    tidyr::pivot_wider(id_cols = c("ecv", "q101", "q103", ethnie_gini), 
                       names_from = ethnie, values_from = prop, values_fill = 0)  %>%
    mutate(total = ethnie_Swahili + ethnie_Mungala + ethnie_Autre + ethnie_Kongo +ethnie_Luba )
  
  ecvs.ethnie.zs <- ecvs.ethnie.zs %>%
    rowwise() %>%
    mutate(max_ethnie_perc = max(ethnie_Swahili, ethnie_Mungala, ethnie_Autre, ethnie_Kongo, ethnie_Luba),
           max_ethnie_name = case_when(ethnie_Swahili == pmax(ethnie_Swahili, ethnie_Mungala, ethnie_Autre, ethnie_Kongo, ethnie_Luba) ~ "ethnie_Swahili",
                                       ethnie_Mungala == pmax(ethnie_Swahili, ethnie_Mungala, ethnie_Autre, ethnie_Kongo, ethnie_Luba) ~ "ethnie_Mungala",
                                       ethnie_Autre == pmax(ethnie_Swahili, ethnie_Mungala, ethnie_Autre, ethnie_Kongo, ethnie_Luba) ~ "ethnie_Autre",
                                       ethnie_Kongo == pmax(ethnie_Swahili, ethnie_Mungala, ethnie_Autre, ethnie_Kongo, ethnie_Luba) ~ "ethnie_Kongo",
                                       ethnie_Luba == pmax(ethnie_Swahili, ethnie_Mungala, ethnie_Autre, ethnie_Kongo, ethnie_Luba) ~ "ethnie_Luba"))
  
  ## Exposure to media ----
  
  ecvs.media_exposure <- ecvs %>%
    dplyr::select(ecv, q101, q103, ponderation_ZS, ponderation, qa211, qa212, qa213) %>%
    mutate(qa211 = ifelse(qa211 == 1, qa211, 0),
           qa212 = ifelse(qa212 == 1, qa212, 0),
           qa213 = ifelse(qa213 == 1, qa213, 0)) %>%
    mutate(id = 1:n()) %>%
    tidyr::pivot_longer(! c(id, ecv, q101, q103, ponderation_ZS, ponderation), names_to = "variable", values_to = "answer") %>%
    group_by(id, ecv, q101, q103, ponderation_ZS, ponderation) %>%
    summarise(n_media = sum(answer))
  
  table(ecvs$ecv, ecvs.media_exposure$n_media)
  
  ecvs.media_exposure_zs <- ecvs.media_exposure %>%
    ungroup() %>%
    group_by_all() %>%
    summarise(n_exposure_par_poids = n()) %>%
    ungroup() %>%
    mutate(n_exposure_pondere = ponderation * n_exposure_par_poids) %>%
    group_by(ecv, q101, q103, n_media, ponderation_ZS) %>%
    summarise(n_exposure_pondere_comp = sum(n_exposure_pondere)) %>%
    mutate(perce_exposure_pondere = n_exposure_pondere_comp / ponderation_ZS)
  
  ecvs.media_exposure_zs.stats <- ecvs.media_exposure_zs %>%
    group_by(q101, n_media) %>%
    summarise(mean_perc= mean(perce_exposure_pondere))
  
  ecvs.media_exposure_zs <- ecvs.media_exposure_zs %>%
    group_by(ecv, q101, q103) %>% 
    filter(n_media == 0) %>%
    rename(perc_hh_without_media = perce_exposure_pondere) %>%
    dplyr::select(- n_media, - ponderation_ZS, -n_exposure_pondere_comp)
  
  
  ## Age des femmes ----
  ecvs.age.zs <- ecvs %>%
    group_by(ecv, q101, q103) %>%
    summarise(#age_moyen_manuel = sum(ponderation * qa103) / unique(ponderation_ZS),
      age_moyen = weighted.mean(qa103, ponderation, na.rm = TRUE),
      age_median = ggstats::weighted.median(qa103, ponderation, na.rm = TRUE, type=2)) %>%
    ungroup()
  
  
  ## Niveau d'étude femme - par pourcentage ----
  ecvs.etude_femme.zs.per_ecv <- ecvs %>%
    dplyr::select(ecv, q101, q103, qa104, ponderation, ponderation_ZS) %>%
    group_by(ecv, q101, q103, qa104) %>%
    summarise(perc_niveau = sum(ponderation) / unique(ponderation_ZS)) %>%
    ungroup() %>%
    tidyr::pivot_wider(id_cols = c(ecv, q101, q103), 
                       names_from = qa104,
                       names_prefix = "etude_",
                       values_from = perc_niveau,
                       values_fill = 0) %>%
    mutate(at_least_secondary_education = etude_3 + etude_2)
  
  
  ## Profession mère ---- 
  code_profession <- data.frame(code = c(0, 1, 2, 3, 4, 5, 6, 7, 8),
                                label = c("Sans profession", "Enseignant", "Fonctionnaire", 
                                          "Agriculture/éleveur", "Pécheur", "Commerçant", "Ouvrier", "Autres", "Eleve / etudiant")) %>%
    mutate(label = gsub("( )?/( )?", "_", label)) %>%
    mutate(label = gsub(" ", "_", label))
  
  ecvs.profession.mere.all <- ecvs %>%
    dplyr::select(ecv, q101, q103, qa105, ponderation_ZS, ponderation) %>%
    zap_labels %>%
    group_by_all() %>%
    summarise(n_religion_par_poids = n()) %>%
    ungroup() %>%
    mutate(n_profession_pondere = ponderation * n_religion_par_poids) %>%
    group_by(ecv, q101, q103, qa105, ponderation_ZS) %>%
    summarise(n_profession_pondere_comp = sum(n_profession_pondere)) %>%
    mutate(perc_profession_pondere = n_profession_pondere_comp / ponderation_ZS) %>%
    left_join(code_profession, by=c(qa105 = "code")) %>%
    ungroup() %>%
    mutate(label = paste("profession_m", label, sep = "_")) %>%
    tidyr::pivot_wider(id_cols = c(ecv, q101, q103), 
                       names_from = label,
                       names_prefix = "",
                       values_from = perc_profession_pondere,
                       values_fill = 0) 
  
  ecvs.profession.mere <- ecvs.profession.mere.all %>%
    mutate(primary = profession_m_Pécheur + profession_m_Agriculture_éleveur,
           secondary = profession_m_Ouvrier,
           tertiary = profession_m_Enseignant + profession_m_Commerçant + profession_m_Fonctionnaire,
           others = profession_m_Sans_profession + profession_m_Autres + profession_m_Eleve_etudiant) %>%
    dplyr::select(ecv, q101, q103, primary, secondary, tertiary, others)
  
  
  ## Taille des foyers ----
  
  
  ecvs.householde_size.perc.per_ecv <- ecvs %>%
    dplyr::select(ecv, q101, q103, qa222, ponderation) %>%
    mutate(qa222 = ifelse(qa222 > 25, NA, qa222)) %>%
    group_by(ecv, q101, q103) %>%
    summarise(median_household_size = ggstats::weighted.median(qa222, ponderation, na.rm = T)) %>%
    ungroup() 
  
  ## Nombre d'enfants de moins de 5 ans ----
  ecvs.householde_nchild.perc.per_ecv <- ecvs %>%
    group_by(ecv, q101, q103) %>%
    summarise(median_household_nchild = ggstats::weighted.median(qa223, ponderation)) %>%
    ungroup()
  
  
  ## Proportion d'enfants de moins de 5 ans ----
  ecvs.householde_propchild.perc.per_ecv <- ecvs %>%
    mutate(qa222 = ifelse(qa222 > 25, NA, qa222)) %>%
    mutate(prop_5yo = qa223 / qa222) %>%
    group_by(ecv, q101, q103) %>%
    summarise(prop_5yo = ggstats::weighted.median(prop_5yo, ponderation)) %>%
    ungroup()
  
  
  ## Possession d'une carte de vaccination ----
  ecvs.vacc_card <- ecvs %>%
    dplyr::select(ecv, q101, q103, carnet_de_sante_disponible, ponderation) %>%
    group_by(ecv, q101, q103) %>%
    summarise(prop_vaccination_card = weighted.mean(carnet_de_sante_disponible, ponderation, na.rm = T)) %>%
    ungroup()
  
  
  
  ## Naissance enregistrée état civil -----
  
  ecvs.civil_registration <- ecvs %>%
    dplyr::select(ecv, q101, q103, vs25e, ponderation) %>%
    mutate(vs25e = ifelse(vs25e %in% c(2, 99), 0, 1)) %>%
    group_by(ecv, q101, q103) %>%
    summarise(prop_registered_state = weighted.mean(vs25e, ponderation, na.rm = T)) %>%
    ungroup()
  
  
  ## Naissance enregistrée FOSA -----
  
  
  ecvs.fosa_registration <- ecvs %>%
    dplyr::select(ecv, q101, q103, vs25d, ponderation) %>%
    mutate(vs25d = ifelse(vs25d %in% c(3, 8), 0, 1)) %>%
    group_by(ecv, q101, q103) %>%
    summarise(prop_registered_fosa = weighted.mean(vs25d, ponderation, na.rm = T)) %>%
    ungroup()
  
  
  ## Vaccination fees ----
  
  
  col_fees <- c("vs85k", "vs85l", "vs85m", "vs85n", "vs85p", "vs85o", 
                "vs85o_1", "vs85o_2", "vs85o_3", "vs85o_4", "vs85o_5", 
                "vs85o_6", "vs85o_7", "vs85oAutre", "vs85p")
  
  ecvs.vacc_fees <- ecvs %>%
    dplyr::select(ecv, q101, q103, all_of(col_fees), ponderation_ZS)
  
  # Questions par ECV
  table(ecvs.vacc_fees$ecv, ecvs.vacc_fees$vs85k, useNA = "ifany")
  
  ecvs.vacc_fees.n <- ecvs.vacc_fees %>%
    group_by_all() %>%
    summarise(n = n())
  
  # Recherche des causes de NA
  ecvs.vaa.check1 <- ecvs %>%
    dplyr::select(ecv, q101, q103, carnet_de_sante_disponible, vs70, vs71, vs85g, vs85j, vs85k)
  
  table(ecvs.vaa.check1$vs85g, ecvs.vaa.check1$carnet_de_sante_disponible, useNA = "ifany")
  
  table(ecvs.vaa.check1$vs85g, ecvs.vaa.check1$vs85k, useNA = "ifany")
  
  ecvs.vaa.check2 <- ecvs %>%
    dplyr::select(carnet_de_sante_disponible, vs70, vs85k) %>%
    group_by_all() %>% summarise(n = n())
  
  # Personne n'ayant pas de réponses (NA) :
  # * n'ont pas de carnet de vaccination
  # * l'enfant n'a pas reçu de vaccin (vs70)
  # * Quid des FOSA ? question non posée en tout cas
  
  # Rule :
  # 1. Suppression des valeurs manquantes
  # 2. Check du nombre de réponse par zone de santé
  # 3. Calcul de l'indicateur
  
  # 1. Suppression des valeurs manquantes
  col_fees_na <- col_fees[ ! col_fees %in% c("vs85oAutre", "vs85o")]
  
  ecvs.vacc_fees.ind <- ecvs.vacc_fees %>%
    filter(! if_all(all_of(col_fees_na), ~ is.na(.)))
  
  # 2. Check du nombre de réponse par zone de santé
  ecvs.vacc_fees.ind.check_zs <- ecvs.vacc_fees.ind %>%
    group_by(ecv, q101, q103) %>%
    summarise(n = n()) %>%
    ungroup() %>%
    mutate(q101_label = gsub(" Province", "", q101)) %>%
    mutate(q103_label = gsub(" Zone de Santé", "", q103))
  
  
  
  # Nombre de personne ayant déjà payé des services
  table(ecvs.vacc_fees.ind$ecv, ecvs.vacc_fees.ind$vs85k)
  cat("Nombre de personnes interrogées ayant déjà payé pour des services de vaccination: ",
      sum(ecvs.vacc_fees.ind$vs85k == 1), "/", nrow(ecvs.vacc_fees.ind),
      " (", 100*sum(ecvs.vacc_fees.ind$vs85k == 1)/nrow(ecvs.vacc_fees.ind), "%)",
      sep="")
  
  
  
  # Organisation des séries de question : 
  # 1. payer pour carte de vaccination (vs85k) -> quel prix (vs85l)
  # 2. payer pour autres services ? (vs85m) -> fréquence (vs85n) / quels services (vs85o) / combien de francs (vs85p)
  # Savoir pour quel service (seringue...) exactement les gens ont payé : 
  # pas très interessant et surement pas exact (vs85oAutre)
  # Distinction carte de vaccination / autres services à garder
  
  # Echelle individuelle : 
  ## valeur monétaire totale --> sensible aux erreures de saisie
  ## 0 / 1 si payement fait
  
  # Echelle zone de santé :
  ## Valeur médiane des frais engagé
  ## Proportion de foyer ayant du engagé des frais 
  
  ecvs.vacc_fees.hs <- ecvs.vacc_fees.ind %>%
    mutate(fees_vacc_card = case_when(vs85l == 1 ~ 250, # "0-500"
                                      vs85l == 2 ~ 1000, # "500-1500"
                                      vs85l == 3 ~ 1500, # "1500 +"
                                      T ~ 0)) %>% # NA / 99
    rowwise() %>%
    mutate(fees_household = sum(c(vs85p, fees_vacc_card), na.rm = T)) %>%
    ungroup() %>%
    mutate(has_payed = fees_household > 0,
           has_fee = case_when(vs85k == 1 | vs85m == 1 ~ T,
                               T ~F))
  
  table(ecvs.vacc_fees.hs$has_payed, ecvs.vacc_fees.hs$has_fee) # 323 due à des valeurs 99 dans la colonne vs85l
  table(ecvs.vacc_fees.hs$vs85k, ecvs.vacc_fees.hs$vs85m, useNA = "ifany")
  table(ecvs.vacc_fees.hs$has_fee, useNA = "ifany")
  
  hist(ecvs.vacc_fees.hs$fees_household)
  
  ecvs.vacc_fees.zs <- ecvs.vacc_fees.hs %>%
    group_by(ecv, q101, q103) %>%
    summarise(vacc_fees_prop_hz = sum(has_fee == TRUE) / n(),
              #prop_hs_vacc_fees2 = weighted.mean(has_fee, ponderation_ZS),
              vacc_fees_mean_value = weighted.mean(fees_household, ponderation_ZS, na.rm = T),
              vacc_fees_n_respondant = sum(! is.na(fees_household))) %>%
    mutate(vacc_fees_mean_value = ifelse(vacc_fees_n_respondant < 15, NA, vacc_fees_mean_value))
  
  
  
  ## Indice de richesse ----
  
  # 1. Sélection des variables
  # 2. ACP
  # 3. Attribution d'un score à chaque foyer
  # 4. Construction des quintiles
  # 5. Vérification avec données dHS à l'échelle province
  # Checks : pondération, diff individu / household
  
  # Correction GHSL: niveau d'urbanisation
  wealth_index_res_file_GHSL <- "other_data/wealth_index_ZS_correction_GHSL.csv"
  
  ecvs.wealth_index.zs.poorest <- read.csv(wealth_index_res_file_GHSL) %>% select(-X) %>%
    mutate(ecv = as.character(ecv))
  
  
  ## Population ZS (données GRID3) -----
  population_density_grid3_res_file <- "other_data/population_density.rds"
  
  pop_density_zs <- readRDS(population_density_grid3_res_file) %>%
    select(q103, densite) %>%
    rename(population_density = densite) %>%
    st_drop_geometry() 
  
  ## Distance au centre de santé : underserved / median time ----
  stat_zonale_accessibility <- "other_data/AccessMode_zonal_statistics.rds"
  
  ecv.stats_zonales <- readRDS(stat_zonale_accessibility) %>%
    mutate(ecv = as.character(as.numeric(year) - 1)) %>%
    select(- year)
  
  ## Population déplacées ----
  pop_deplacees_2021 <- arrow::read_parquet("other_data/pop_movements_2021.parquet")
  pop_deplacees_2022 <- arrow::read_parquet("other_data/pop_movements_2022.parquet")
  pop_deplacees_2023 <- arrow::read_parquet("other_data/pop_movements_2023.parquet")
  pop_deplacees_2024 <- arrow::read_parquet("other_data/pop_movements_2024.parquet")
  
  pop_deplacees <- bind_rows(pop_deplacees_2021, pop_deplacees_2022, pop_deplacees_2023, pop_deplacees_2024)
  
  pop_deplacees.clean <- pop_deplacees %>%
    # grouper par années
    mutate(year = lubridate::year(movement_date)) %>%
    group_by(year, departure_province, departure_hz, arrival_province, arrival_hz) %>%
    summarise(household_year = sum(household),
              person_year = sum(person)) %>%
    ungroup() %>%
    # renommer provinces pour le merge
    left_join(abr_provinces, by = c(departure_province = "province")) %>%
    left_join(abr_provinces, by = c(arrival_province = "province"), suffix = c("_departure", "_arrival")) %>%
    mutate(q101_departure = paste(abbreviation_departure, departure_province, "Province")) %>%
    mutate(q101_arrival = paste(abbreviation_arrival, arrival_province, "Province")) %>%
    # Renommer zones de santé pour le merge
    mutate(q103_departure = paste(abbreviation_departure, departure_hz, "Zone de Santé")) %>%
    mutate(q103_arrival = paste(abbreviation_arrival, arrival_hz, "Zone de Santé")) %>%
    # Renommer années pour le merge
    mutate(ecv = year - 1) %>% 
    # Nettoyage du df
    dplyr::select(- c(abbreviation_departure, abbreviation_arrival, departure_province, arrival_province, departure_hz, arrival_hz, year)) 
  
  
  # Deuxième df : par zone de santé, compter nombre d'arrivées et de départ
  pop_deplacees.zs.arrival <- pop_deplacees.clean %>%
    group_by(q101_arrival, q103_arrival, ecv) %>%
    summarise(household_arrival = sum(household_year),
              person_arrival = sum(person_year))
  pop_deplacees.zs.departure <- pop_deplacees.clean %>%
    group_by(q101_departure, q103_departure, ecv) %>%
    summarise(household_departure = sum(household_year),
              person_departure = sum(person_year))
  
  pop_deplacees.zs <- pop_deplacees.zs.arrival %>%
    full_join(pop_deplacees.zs.departure, by = c(q101_arrival = "q101_departure", 
                                                 q103_arrival = "q103_departure",
                                                 "ecv")) %>%
    dplyr::rename(q101 = q101_arrival,
                  q103 = q103_arrival) %>%
    mutate(across(matches("departure|arrival"), ~ tidyr::replace_na(., 0))) 
  
  n_zs_null <- pop_deplacees.zs %>%
    ungroup() %>% group_by(ecv) %>%
    mutate(total_person_arrival_ecv = sum(person_arrival),
           total_household_arrival_ecv = sum(household_arrival),
           total_person_departure_ecv = sum(person_departure),
           total_household_departure_ecv = sum(household_departure),) %>%
    ungroup() %>%
    filter(grepl("NULL", q103)) %>%
    group_by(ecv) %>%
    mutate(sum_person_departure_NULL = sum(person_departure),
           sum_household_departure_NULL = sum(household_departure),
           prop_pers_departure_ecv_null =  sum_person_departure_NULL / total_person_departure_ecv,
           prop_household_departure_ecv_null =  sum_household_departure_NULL / total_household_departure_ecv) 
  
  pop_deplacees.zs <- pop_deplacees.zs %>%
    # Suppression des zones de santé NULL
    filter(! grepl("NULL", q103)) %>%
    # Renommer lm NGandajika Zone de Santé pour futurs merge
    mutate(q103 = ifelse(q103 == "lm Ngandajika Zone de Santé", "lm NGandajika Zone de Santé", q103)) %>%
    mutate(household_arrival = ifelse(is.na(household_arrival), 0, household_arrival),
           household_departure = ifelse(is.na(household_departure), 0, household_departure),
           person_departure = ifelse(is.na(person_departure), 0, person_departure),
           person_arrival = ifelse(is.na(person_arrival), 0, person_arrival)) %>%
    mutate(ecv = as.character(ecv))
  
  # check : average household size : 1 - 9 (ok) 
  
  
  ## Données accessibilité spatiale ----
  ai_zs <- readRDS("other_data/spatial_accessibility_ZS.rds")
  
  # Remise en forme: format ecv - q101 - q103 - Ai_wk - Ai_vd
  ecv.ai_zs <- ai_zs %>%
    mutate(province = case_when(province == "Mai-Ndombe" ~ "Maindombe",
                                grepl("Kasaï", province) ~ gsub("-", " ", gsub("ï", "i", province)),
                                T ~ gsub("-", " ", province))) %>%
    mutate(q101 = paste(abbreviation, province, "Province")) %>%
    dplyr::select(q101, q103, matches("aizs_")) %>%
    tidyr::pivot_longer(! c(q101, q103), names_to = c("ai", "year"), values_to = "value",
                        names_prefix = "aizs_",
                        names_sep = "_") %>%
    tidyr::pivot_wider(names_from = "ai", values_from = "value") %>%
    mutate(year = as.numeric(year)) %>%
    filter(year %in% c(2022, 2023)) %>%
    filter(q101 != "NA NA Province") 
  
  # Copie pour 2021 car manque de données SNIS
  ecv.ai_zs.2021 <- ecv.ai_zs %>%
    filter(year == 2022) %>%
    mutate(year = 2021)
  
  ecv.ai_zs <- ecv.ai_zs %>%
    bind_rows(ecv.ai_zs.2021) %>%
    rename(ecv = year) %>%
    mutate(ecv = as.character(ecv))
  
  
  # Construction du dataframe complet - par ECV - TODO ----
  ecvs.cov_ZS <- ecvs.age.zs %>%
    left_join(pop_density_zs, by = c("q103")) %>% # GRID3
    left_join(ecv.stats_zonales, by = c("q103", "ecv")) %>%
    left_join(ecvs.etude_femme.zs.per_ecv, by=c("ecv", "q101", "q103")) %>%
    left_join(ecvs.ethnie.zs, by = c("ecv", "q101", "q103")) %>%
    left_join(ecvs.media_exposure_zs, by = c("ecv", "q101", "q103")) %>%
    left_join(ecvs.householde_size.perc.per_ecv, by = c("ecv", "q101", "q103")) %>%
    left_join(ecvs.householde_nchild.perc.per_ecv, by = c("ecv", "q101", "q103")) %>%
    left_join(pop_deplacees.zs, by = c("ecv", "q101", "q103")) %>%
    full_join(ecvs.vacc_fees.zs, by = c("ecv", "q101", "q103")) %>%
    full_join(ecvs.wealth_index.zs.poorest, by = c("ecv", "q101", "q103")) %>%
    full_join(ecvs.urbain, by = c("ecv", "q101", "q103")) %>%
    full_join(ecvs.urbain.ghsl, by = c("q103", "ecv")) %>%
    full_join(ecvs.religion.perc.zs, by = c("ecv", "q101", "q103"))  %>%
    full_join(ecvs.profession.mere, by = c("ecv", "q101", "q103")) %>%
    full_join(ecvs.vacc_card, by = c("ecv", "q101", "q103")) %>%
    full_join(ecvs.fosa_registration, by = c("ecv", "q101", "q103")) %>%
    full_join(ecvs.civil_registration, by = c("ecv", "q101", "q103")) %>%
    left_join(ecv.ai_zs, c("ecv", "q101", "q103")) %>%
    left_join(ecvs.householde_propchild.perc.per_ecv, c("ecv", "q101", "q103")) 
  
  return(ecvs.cov_ZS)
}

compute_covariables_ECV_HH_level <- function(indf, 
                                             indf_ZS, # Covariable computed at the HZ level
                                             rules_file = "rules/covariates_HH.xlsx"){
  
  
  
  ecvs <- indf %>%
    filter(vs25 < 24) %>% # Récupération des échantillons dans les âges attendus : 6 - 23 mois
    filter(vs25 > 5)
  
  rules <- readxl::read_xlsx(rules_file, 
                             sheet = "Household - details v3",
                             col_types = "text") %>%
    tidyr::fill(Category, .direction = "downup") %>%
    tidyr::fill(`Theoretical domain`, .direction = "downup") %>%
    tidyr::fill(`Composite index`, .direction = "downup") 
  
  ecvs_inds <- ecvs 
  
  # Create indicators ----
  ecvs_MF0 <- data.frame(id = ecvs_inds$id)
  
  
  for (ind in unique(rules$`Composite index`)){
    
    cols_ind <- rules %>%
      filter(`Composite index` == ind) %>%
      filter(! is.na(`VCS id`)) %>%
      pull(`VCS id`)
    
    # Trust in healthcare workers----
    if (ind == "Trust in healthcare workers"){
      ecvs_MF0 <- ecvs_MF0 %>%
        full_join(ecvs_inds[, c("id", "BeSD6")], by = "id") %>%
        rename(trust_in_hcw = BeSD6)
      
    }
    
    # Missed opportunities ----
    if (ind == "Missed opportunities"){
      
      ecvs_inds_i <- ecvs_inds %>%
        filter(ecv != 2021) %>%
        select(all_of(cols_ind), ponderation, id) %>%
        mutate(vs107 = case_when(vs107 == 1 ~ 2, 
                                 vs107 == 2 ~ 0, 
                                 vs107 == 99 ~ 1)) %>%
        mutate(BeSD14 = case_when(BeSD14 == 2 ~ 0, 
                                  BeSD14 == 1 ~ 1, 
                                  T ~ BeSD14)) %>%
        mutate(mean_BeSD14 = mean(BeSD14, na.rm = T)) %>%
        mutate(BeSD14 = ifelse(is.na(BeSD14), mean_BeSD14, BeSD14)) %>%
        # Calcul des z-score
        mutate(vs107z = (vs107 - mean(vs107)) / sd(vs107),
               BeSD14z = (BeSD14 - mean(BeSD14, na.rm = T)) / sd(BeSD14))
      
      
      ecvs_inds_i.scores <- ecvs_inds_i %>%
        rowwise() %>%
        mutate(mean2 = mean(c(vs107z, BeSD14z), na.rm = T)) %>% ungroup() 
      
      ecvs_MF0 <- ecvs_MF0 %>%
        full_join(ecvs_inds_i.scores[, c("id", "mean2")], by = "id") %>%
        rename(missed_opportunities = mean2)
      
    }
    
    
    # Outreach ----
    if (ind == "Outreach"){
      
      ecvs_inds_i <- ecvs_inds %>%
        filter(ecv != 2021) %>%
        select(all_of(cols_ind), ponderation, id) %>%
        mutate(BeSD7 = case_when(BeSD7 == 1 ~ 1, 
                                 BeSD7 == 2 ~ 0)) %>%
        mutate(BeSD8 = case_when(BeSD8 == 1 ~ 1, 
                                 BeSD8 == 2 ~ 0)) %>%
        mutate(qa505 = case_when(qa505 == 2 ~ 0, 
                                 qa505 == 1 ~ 1)) 
      
      res.pca.ind.d <- PCA(ecvs_inds_i[cols_ind], graph = T)
      
      ecvs_inds_i.scores <- ecvs_inds_i %>%
        mutate(score = res.pca.ind.d$ind$coord[,1])
      
      ecvs_MF0 <- ecvs_MF0 %>%
        full_join(ecvs_inds_i.scores[, c("id", "score")], by = "id") %>%
        rename(outreach = score)
      
    }
    
    
    # Perceived ease to vaccinate children ----
    if (ind == "Perceived ease to vaccinate children"){
      
      ecvs_inds_i <- ecvs_inds %>%
        select(all_of(cols_ind), id) %>%
        mutate(mean_score = rowMeans(pick(BeSD17, BeSD18), na.rm = TRUE))
      
      ecvs_MF0 <- ecvs_MF0 %>%
        full_join(ecvs_inds_i[, c("id", "mean_score")], by = "id") %>%
        rename(ease_to_vaccinate_children = mean_score) %>%
        zap_label()
      
    }
    
    # Cultural alignment ----
    if (ind == "Cultural alignment"){
      ecvs.zs.rel_eth <- indf_ZS %>%      
        select(ecv, q101, q103, starts_with("religion"), starts_with("ethni")) %>%
        select(- ethnie_gini, -religion_gini)
      
      code_ethnie <- data.frame(code = c(1, 2, 3, 4, 5),
                                label = c("Luba", "Kongo", "Swahili", "Mungala", "Autre"))
      
      code_religion <- data.frame(code = c(1, 2, 3, 4, 5, 6, 8, 9, 7),
                                  label = c("Pas de religion", "Catholique", "Protestante", 
                                            "Kimbanguiste", "Musulmane", "Eglise de réveil/indépendante", 
                                            "Ne sait pas", "Pas de réponse", "Autre religion")) %>%
        mutate(label = gsub("[/| ]", "_", label))
      
      cols_ind <- c("qa208", # ethnie
                    "qa207", # religion chef de ménage
                    "qa106") # religion mère
      
      ecvs_inds_i <- ecvs_inds %>%
        select(id, ecv, q101, q103, all_of(cols_ind), qa610) %>%
        left_join(ecvs.zs.rel_eth, by = c("ecv", "q101", "q103")) %>%
        # Garder : pourcentage pour ethnie majoritaire + ethnie de la mère
        left_join(code_ethnie, by=c(qa208 = "code")) %>%
        left_join(code_religion, by=c(qa106 = "code"), suffix = c("_ethnie", "_religion")) %>%
        
        # Ethnic group
        tidyr::pivot_longer(starts_with("ethnie"), values_to = "perc_ethnie", names_to = "ethnie") %>%
        group_by(id) %>%
        mutate(maj_ethnie = ethnie[which.max(perc_ethnie)],
               maj_ethnie_perc = perc_ethnie[which.max(perc_ethnie)]) %>%
        mutate(caregiver_ethnie_perc = perc_ethnie[ethnie == paste0("ethnie_", label_ethnie)]) %>%
        mutate(caregiver_is_max_ethnic = paste0("ethnie_", label_ethnie) == maj_ethnie) %>%
        select(- ethnie, -perc_ethnie) %>% distinct() %>% ungroup() %>%
        
        # Religion
        tidyr::pivot_longer(starts_with("religion"), values_to = "perc_religion", names_to = "religion") %>%
        group_by(id) %>%
        mutate(maj_religion = religion[which.max(perc_religion)],
               maj_religion_perc = perc_religion[which.max(perc_religion)]) %>%
        mutate(caregiver_religion_perc = perc_religion[religion == paste0("religion_", label_religion)]) %>%
        select(- religion, -perc_religion) %>% distinct() %>% ungroup() 
      
      ecvs_inds_i.idx <- ecvs_inds_i %>%
        # Indice
        mutate(diff_ethnie = 100 * (1 - (maj_ethnie_perc - caregiver_ethnie_perc))) %>%
        mutate(diff_religion = 100 * (1 - (maj_religion_perc - caregiver_religion_perc))) %>%
        rowwise() %>%
        mutate(cultural_alignmenent_1 = diff_ethnie * diff_religion,
               cultural_alignmenent_2 = exp(mean(log(diff_ethnie, diff_religion)))) %>%
        tidyr::pivot_longer(c(diff_ethnie, diff_religion), names_to = "score_name",
                            values_to = "score_val") %>%
        left_join(indf_ZS[,c("ecv", "q101", "q103", "religion_gini")]) %>%
        mutate(label_ethnie = ifelse(label_ethnie == "Autre", "Other", label_ethnie),
               label_ethnie = factor(label_ethnie, 
                                     levels = c("Kongo", "Luba", "Mungala", "Swahili", "Other")))
      
      
      ecvs_MF0 <- ecvs_MF0 %>%
        full_join(ecvs_inds_i[, c("id", "caregiver_ethnie_perc", "caregiver_is_max_ethnic")], by = "id") %>%
        rename(cultural_alignment = caregiver_ethnie_perc,
               is_max_ethnic_group = caregiver_is_max_ethnic)
      
    }
    
    
    # Knowledge about preventable diseases -----
    if (ind == "Knowledge about preventable diseases"){
      cols_ind.vacc <- c("vs127", "vs128", "vs129", "vs130", "vs131", "vs132")
      
      
      ecvs_inds_i <- ecvs_inds %>%
        select(id, all_of(cols_ind), all_of(cols_ind.vacc)) %>%
        mutate(across(! c(id), ~ ifelse(. == 1, 1, 0))) %>%
        rowwise() %>%
        mutate(knowledge_diseases = qa501_1 + qa501_2 + qa501_3 + qa501_4 + 
                 qa501_5 + qa501_6 + qa501_7 + qa501_8 + 
                 qa501_9 + qa501_10 +  qa501_11+ qa501_12) %>%
        mutate(knowledge_vaccines = vs127 + vs128 + vs129 + vs130 + vs131 + vs132) %>%
        ungroup()
      
      
      ecvs_MF0 <- ecvs_MF0 %>%
        full_join(ecvs_inds_i[, c("id", "knowledge_diseases", "knowledge_vaccines")], by = "id")
      
    }
    
    # Household members travels avec ONE-HOT ENCODING ----
    if (ind == "Household members travels"){
      
      ecvs_inds_i <- ecvs_inds %>%
        filter(ecv != 2021) %>%
        dplyr::select(all_of(cols_ind), id) %>%
        # toutes les valeurs manquantes sont recodées en 0
        mutate(vs136 = ifelse(vs136 == 1, 1, 0)) %>%
        
        # Si pas de voyage déclarés, toutes les autres questions sont à 0
        mutate(vs137 = ifelse(vs136 == 0, 0, vs137)) %>%
        mutate(vs138 = vs138 + 1) %>% # 0 already in answers
        mutate(vs138 = ifelse(vs136 == 0, 0, vs138)) %>%
        mutate(vs139 = ifelse(vs136 == 0, 0, vs139)) %>%
        
        # Recoder réponse "Ne sait pas" (sauf pour vs138, sans 99 ou NA)
        # Si ne sait pas sur plusieurs questions : 0
        mutate(vs137 = ifelse(is.na(vs137) & is.na(vs139), 0, vs137)) %>%
        mutate(vs139 = ifelse(is.na(vs137) & is.na(vs139), 0, vs139)) %>%
        
        # Modification par réponse individuelles : NA pour imputation
        mutate(vs139 = ifelse(vs139 == 99, NA, vs139)) %>%
        mutate(vs137 = ifelse(vs137 == 4, NA, vs137)) %>%
        # Autre méthode, mais encore plus discutable
        # mutate(vs139 = ifelse(vs139 == 99, 0.5, vs139)) %>%
        # mutate(vs137 = ifelse(vs137 == 4, 0.5, vs137))  
        
        # One-hote encoding de vs139 (qui part)
        mutate(vs139 = as.factor(vs139))
      
      oh_vs139 <- caret::dummyVars(" ~ vs139", data = ecvs_inds_i)
      ecvs_inds_i_vs139 <- data.frame(predict(oh_vs139, newdata = ecvs_inds_i))
      
      ecvs_inds_i <- ecvs_inds_i %>%
        bind_cols(ecvs_inds_i_vs139) %>%
        select(- vs139.0) 
      
      cols_ind2 <- c(cols_ind, paste("vs139", seq(1:5), sep = "."))
      cols_ind2 <- cols_ind2[cols_ind2 != "vs139"]
      
      
      res.pca.ind <- PCA(ecvs_inds_i[cols_ind2])
      
      
      ecvs_inds_i.scores <- ecvs_inds_i %>%
        mutate(score1 = res.pca.ind$ind$coord[,1]) 
      
      ecvs_MF0 <- ecvs_MF0 %>%
        full_join(ecvs_inds_i.scores[, c("id", "score1")], by = "id") %>%
        rename(household_travel_ohe = score1)
      
    }
    
    # Fear of side effects ----
    if (ind == "Awareness of vaccines side effects"){
      
      ecvs_inds_i <- ecvs_inds %>%
        filter(ecv != 2021) %>%
        select(all_of(cols_ind), id) %>%
        # Encodage 1
        mutate(vs118 = case_when(vs118 == 1 ~ 1,
                                 vs118 == 2 ~ 0,
                                 vs118 == 99 ~ 0)) %>%
        mutate(q618 = case_when(q618 == 3 ~ 1,
                                q618 == 2 ~ 0,
                                q618 == 4 ~ 0,
                                q618 == 1 ~ 0)) %>%
        # Encodage 2
        mutate(vs118z = case_when(vs118 == 1 ~ 1,
                                  vs118 == 2 ~ 0,
                                  vs118 == 99 ~ 0.5)) %>%
        mutate(q618z = case_when(q618 == 3 ~ 1,
                                 q618 == 2 ~ 0.5,
                                 q618 == 4 ~ 0.5,
                                 q618 == 1 ~ 0)) %>%
        # NSP
        # mutate(vs118 = case_when(vs118 == 1 ~ 1,
        #                          vs118 == 2 ~ -1,
        #                          vs118 == 99 ~ 0)) %>%
        # mutate(q618 = case_when(q618 == 3 ~ 1,
        #                         q618 == 2 ~ 0,
        #                         q618 == 1 ~ -1,
        #                         q618 == 4 ~ 0)) %>%
        rowwise() %>% 
        mutate(sum = vs118z + q618z,
               meanz = mean(c(vs118z, q618z)),
               mean = mean(c(q618, vs118))) %>% 
        ungroup()
      
      
      
      ecvs_inds_i.score <- ecvs_inds_i 
      #mutate(score = res.pca.ind$ind$coord[,1]) 
      
      ecvs_inds_i.score.p <- ecvs_inds_i.score %>%
        tidyr::pivot_longer(c(sum, mean, meanz), names_to = "var", values_to = "value")
      
      
      ecvs_MF0 <- ecvs_MF0 %>%
        full_join(ecvs_inds_i.score[, c("id", "mean")], by = "id") %>%
        rename(fear_side_effects = mean)
      
    } 
    
    # Fear of diseases ----
    if (ind == "Fear of diseases"){
      
      ecvs_inds_i <- ecvs_inds %>%
        filter(ecv != 2021) %>%
        select(all_of(cols_ind), ponderation, id) %>%
        # Réencodage de qa102 pour placer correctement la réponse neutre
        mutate(qa612 = case_when(qa612 %in% c(3, 4) ~ qa612+1,
                                 qa612 == 5 ~ 3,
                                 T ~ qa612)) %>%
        # Renverser score
        mutate(qa612 = 6 - qa612) %>%
        mutate(qa613 = 5 - qa613) %>%
        # qa612 et qa613 sur deux échelles : utilisation du z-score
        # https://www.researchgate.net/post/How_can_I_convert_different_point_Likert_scales_for_all_questionnaires_in_a_survey
        mutate(z_score_qa612 = (qa612 - mean(qa612))/sd(qa612)) %>%
        mutate(z_score_qa613 = (qa613 - mean(qa613))/sd(qa613))
      
      
      res.pca.ind <- PCA(ecvs_inds_i[,c(cols_ind)])
      
      ecvs_inds_i.score <- ecvs_inds_i %>%
        rowwise() %>% 
        mutate(sum = z_score_qa612 + z_score_qa613,
               mean = mean(z_score_qa612, z_score_qa613)) %>% 
        ungroup()  %>%
        mutate(score = res.pca.ind$ind$coord[,1])
      
      ecvs_MF0 <- ecvs_MF0 %>%
        full_join(ecvs_inds_i.score[, c("id", "mean")], by = "id") %>%
        rename(fear_diseases = mean)
      
    }
    
    # Self-efficacy ----
    if (ind == "Self-efficacy"){
      
      ecvs_inds_i <- ecvs_inds %>%
        select(all_of(cols_ind), id) %>%
        mutate(qa604 = case_when(qa604 %in% c(3, 4) ~ qa604 + 1,
                                 qa604 == 5 ~ 3,
                                 T ~ qa604)) %>%
        # Inversion du sens
        mutate(qa604 = 6 - qa604) 
      
      ecvs_inds_i.score <- ecvs_inds_i %>%
        mutate(score = qa604)
      
      ecvs_MF0 <- ecvs_MF0 %>%
        full_join(ecvs_inds_i.score[, c("id", "score")], by = "id") %>%
        rename(self_efficacy = score)
      
    }
    
    # Gender inequalities ----
    if (ind == "Gender inequalities"){
      
      ecvs_inds_i <- ecvs_inds %>%
        select(all_of(cols_ind), qa607, id) %>%
        # Rencoder BeSD sur 0/ 1
        mutate(BeSD13 = ifelse(BeSD13 == 1, 1, 0)) %>%
        # Rencoder proprement 5-point Likert scale
        mutate(qa607 = case_when(qa607 %in% c(3, 4) ~ qa607 + 1,
                                 qa607 == 5 ~ 3,
                                 T ~ qa607)) %>%
        # Inversion du sens
        mutate(qa607 = 6 - qa607)
      
      ecvs_MF0 <- ecvs_MF0 %>%
        full_join(ecvs_inds_i[, c("id", "BeSD13")], by = "id") %>%
        rename(gender_imbalance = BeSD13)
      
    }
    
    # Community norms on vaccination ----
    if (ind == "Community norms on vaccination"){
      
      ecvs_inds_i <- ecvs_inds %>%
        filter(ecv != 2021) %>%
        select(all_of(cols_ind), id) %>%
        mutate(qa610 = case_when(qa610 == 5 ~ 3,
                                 qa610 %in% c(3,4) ~ qa610 + 1,
                                 T ~ qa610)) %>%
        mutate(qa611 = case_when(qa611 == 5 ~ 3,
                                 qa611 %in% c(3,4) ~ qa611 + 1,
                                 T ~ qa611)) %>%
        mutate(BeSD12 = ifelse(BeSD12 == 2, 0, BeSD12)) %>%
        # Modification du sens
        mutate(qa610 = 6 - qa610) %>%
        mutate(qa611 = 6 - qa611) %>%
        mutate(BeSD9 = case_when(BeSD9 == 1 ~ 1,
                                 BeSD9 == 2 ~ -1)) %>%
        mutate(BeSD10 = case_when(BeSD10 == 1 ~ 1,
                                  BeSD10 == 2 ~ -1)) %>%
        mutate(BeSD11 = case_when(BeSD11 == 1 ~ 1,
                                  BeSD11 == 2 ~ -1,
                                  BeSD11 == 8 ~ 0)) %>%
        mutate(qa608 = case_when(qa608 %in% c(1, 2) ~ 1,
                                 qa608 %in% c(3,4) ~ -1,
                                 qa608 == 5 ~ 0)) %>%
        mutate(qa606 = case_when(qa606 %in% c(1, 2) ~ 1,
                                 qa606 %in% c(3,4) ~ -1,
                                 qa606 == 5 ~ 0)) %>%
        mutate(qa609 = case_when(qa609 %in% c(1, 2) ~ 1,
                                 qa609 %in% c(3,4) ~ -1,
                                 qa609 == 5 ~ 0)) %>%
        mutate(qa622 = case_when(qa622 == 1 ~ -1,
                                 qa622 == 2 ~ 0,
                                 qa622 == 3 ~ 1,
                                 qa622 == 4 ~ 0.1))
      
      ecvs_inds_i2 <- ecvs_inds %>%
        filter(ecv != 2021) %>%
        select(all_of(cols_ind), id) %>%
        mutate(qa610 = case_when(qa610 == 5 ~ 3,
                                 qa610 %in% c(3,4) ~ qa610 + 1,
                                 T ~ qa610)) %>%
        mutate(qa611 = case_when(qa611 == 5 ~ 3,
                                 qa611 %in% c(3,4) ~ qa611 + 1,
                                 T ~ qa611)) %>%
        mutate(BeSD12 = ifelse(BeSD12 == 2, 0, BeSD12)) %>%
        # Modification du sens
        mutate(qa610 = 6 - qa610) %>%
        mutate(qa611 = 6 - qa611) %>%
        mutate(BeSD9 = case_when(BeSD9 == 1 ~ 1,
                                 BeSD9 == 2 ~ -1)) %>%
        mutate(BeSD10 = case_when(BeSD10 == 1 ~ 1,
                                  BeSD10 == 2 ~ -1)) %>%
        mutate(BeSD11 = case_when(BeSD11 == 1 ~ 1,
                                  BeSD11 == 2 ~ -1,
                                  BeSD11 == 8 ~ 0)) %>%
        mutate(qa608 = case_when(qa608 %in% c(3,4) ~ qa608+1,
                                 qa608 == 5 ~ 3,
                                 T ~ qa608)) %>%
        mutate(qa606 = case_when(qa606 %in% c(3,4) ~ qa606+1,
                                 qa606 == 5 ~ 3,
                                 T ~ qa606)) %>%
        mutate(qa609 = case_when(qa609 %in% c(3,4) ~ qa609+1,
                                 qa609 == 5 ~ 3,
                                 T ~ qa609)) %>%
        mutate(qa622 = case_when(qa622 == 1 ~ -1,
                                 qa622 == 2 ~ 0,
                                 qa622 == 3 ~ 1,
                                 qa622 == 4 ~ 0)) %>%
        # Correction sens des questions
        mutate(qa608 = 6 - qa608) %>%
        mutate(qa606 = 6 - qa606) %>%
        #mutate(qa607 = 6 - qa607) %>%
        mutate(qa609 = 6 - qa609)
      
      
      
      res.pca.ind <- PCA(ecvs_inds_i[,c(cols_ind)])
      res.pca.ind2 <- PCA(ecvs_inds_i2[,c(cols_ind)])
      
      #fviz_pca_biplot(res.pca.ind, geom = "point")
      weights <- abs(res.pca.ind$var$contrib[,1]) / sum(abs(res.pca.ind$var$contrib[,1]))
      weights2 <- abs(res.pca.ind$var$coord[,1]) / sum(abs(res.pca.ind$var$coord[,1]))
      
      
      ecvs_inds_i.score <- ecvs_inds_i2 %>%
        rowwise() %>% 
        mutate(sum = BeSD9 + BeSD10 + BeSD11 + qa608 + qa606 + qa609 + qa622) %>% 
        ungroup() %>%
        mutate(score = res.pca.ind$ind$coord[,1]) %>%
        mutate(score_check2 = weights2["BeSD9"]*BeSD9 + weights2["BeSD10"]*BeSD10 + weights2["BeSD11"]*BeSD11 + weights2["qa608"]*qa608 + weights2["qa606"]*qa606 + 
                 weights2["qa609"]*qa609 + weights2["qa622"]*qa622,
               score2 = res.pca.ind2$ind$coord[,1])
      
      ecvs_MF0 <- ecvs_MF0 %>%
        full_join(ecvs_inds_i.score[, c("id", "score2")], by = "id") %>%
        rename(community_norms = score2)
      
    }
    
    # Opinion on vaccines ----
    if (ind == "Opinion on vaccines"){
      
      cols_ind <- c("BeSD4", "qa603", "BeSD5", "qa601")
      
      ecvs_inds_i <- ecvs_inds %>%
        filter(ecv != 2021) %>%
        select(all_of(cols_ind), id) %>%
        mutate(qa603 = case_when(qa603 == 1 ~ 2,
                                 qa603 == 2 ~ 1,
                                 qa603 == 3 ~ -1,
                                 qa603 == 4 ~ -2,
                                 qa603 == 5 ~ 0)) %>%
        mutate(qa601 = case_when(qa601 == 1 ~ 2,
                                 qa601 == 2 ~ 1,
                                 qa601 == 3 ~ -1,
                                 qa601 == 4 ~ -2,
                                 qa601 == 5 ~ 0,
                                 qa601 == 6 ~ 0)) %>%
        mutate(BeSD4 = case_when(BeSD4 == 1 ~ -2,
                                 BeSD4 == 2 ~ -1,
                                 BeSD4 == 3 ~ 1,
                                 BeSD4 == 4 ~ 2)) %>%
        mutate(BeSD5 = case_when(BeSD5 == 1 ~ -2,
                                 BeSD5 == 2 ~ -1,
                                 BeSD5 == 3 ~ 1,
                                 BeSD5 == 4 ~ 2))
      # mutate(qa605 = case_when(qa605 == 5 ~ 3,
      #                          qa605 %in% c(3, 4) ~ qa601 + 1,
      #                          T ~ qa605)) %>%
      
      
      res.pca.ind <- PCA(ecvs_inds_i[,c(cols_ind)])
      
      ecvs_inds_i.score <- ecvs_inds_i %>%
        mutate(score = res.pca.ind$ind$coord[,1])
      
      ecvs_MF0 <- ecvs_MF0 %>%
        full_join(ecvs_inds_i.score[, c("id", "score")], by = "id") %>%
        rename(opinion_on_vaccines = score)
      
    }
    
    # Compliance with procedures ----
    if (ind == "ARCHIVED Compliance with procedures"){
      
      ecvs_inds_i <- ecvs_inds %>%
        select(all_of(cols_ind), vs26, ponderation, id) %>% 
        # vs26 pour check si NA
        mutate(vs25d = case_when(vs25d == 1 ~ 2,
                                 vs25d == 2 ~ 1,
                                 vs25d == 3 ~ -1,
                                 vs25d == 8 ~ 0)) %>%
        mutate(vs25e = case_when(vs25e == 1 ~ 2,
                                 vs25e == 2 ~ -1,
                                 vs25e == 99 ~ 0))
      
      
      ecvs_inds_i.score <- ecvs_inds_i %>%
        # Calcul des z-score
        mutate(vs25dz = (vs25d - mean(vs25d)) / sd(vs25d),
               vs25ez = (vs25e - mean(vs25e, na.rm = T)) / sd(vs25e)) %>%
        rowwise() %>% 
        mutate(mean = mean(c(vs25d, vs25e)),
               meanz = mean(c(vs25dz, vs25ez))) %>% 
        ungroup()
      
      ecvs_MF0 <- ecvs_MF0 %>%
        full_join(ecvs_inds_i.score[, c("id", "meanz")], by = "id") %>%
        rename(compliance_with_procedures = meanz)
    }
    
    if (ind == "Compliance with procedures"){
      
      ecvs_inds_i <- ecvs_inds %>%
        select(all_of(cols_ind), vs26, ponderation, id) %>% 
        # vs26 pour check si NA
        mutate(vs25f = case_when(vs25f == 1 ~ 1,
                                 vs25f == 2 ~ 0))
      
      ecvs_MF0 <- ecvs_MF0 %>%
        full_join(ecvs_inds_i[, c("id", "vs25f")], by = "id") %>%
        rename(compliance_with_procedures = vs25f)
    }
    
    # Religion ----
    if (ind == "Religion influence"){
      ecvs_inds_i <- ecvs_inds %>%
        filter(ecv != 2021) %>%
        select(all_of(cols_ind), ponderation, id) %>% 
        mutate(qa610 = case_when(qa610 == 5 ~ 3,
                                 qa610 %in% c(3,4) ~ qa610 + 1,
                                 T ~ qa610)) %>%
        mutate(qa611 = case_when(qa611 == 5 ~ 3,
                                 qa611 %in% c(3,4) ~ qa611 + 1,
                                 T ~ qa611)) %>%
        # Z-score et average
        mutate(qa611z = (qa611 - mean(qa611)) / sd(qa611),
               qa610z = (qa610 - mean(qa610, na.rm = T)) / sd(qa610)) %>%
        rowwise() %>%
        mutate(score = mean(c(qa610z, qa611z), na.rm = T)) %>%
        ungroup()
      
      na_columns <- colSums(is.na(ecvs_inds_i)) %>%
        as.data.frame() %>%
        filter(. != 0)
      
      ecvs_MF0 <- ecvs_MF0 %>%
        full_join(ecvs_inds_i[, c("id", "score")], by = "id") %>%
        rename(religion_influence = score)
    }
  }
  
  
  # Merge with control variables (not processed) ----
  variables_control <- rules %>%
    filter(Category == "Control") %>%
    filter(!is.na(`VCS id`)) %>%
    pull(`VCS id`)
  
  ecvs_MF0c <- ecvs_MF0 %>%
    full_join(indf[, c("id", variables_control)], 
              by = "id") %>%
    rename(age_child = vs25,
           sex_child = vs20,
           ethnic_group = qa208,
           religion_mother = qa106,
           sex_family_head = qa201,
           education_mother = qa104) 
  
  
  
  return(ecvs_MF0c)
}

# Data ----
rules_for_preprocessing_steps <- readxl::read_xlsx("rules/preprocessing_step.xlsx")

survey_files <- list.files(path = "raw_data",
                           full.names = T)

pyramide_sanitaire <- read.csv("other_data/250728_pyramide_sanitaire.csv")


# Run  -----
ecv_data <- vector("list", 3) # initialize list for the 3 dataframes (surveys)
i <- 1

for (survey_file in survey_files){

  # Loading data
  survey <- read_dta(survey_file)
  survey_year <- gsub("^(.+?)_([0-9]{4})_(.+?)$", "\\2", basename(survey_file))

  # Unique identifier corrections
  # Follow work by Sasi et al., 2026
  key_cols <- names(survey)[grepl("key|KEY|SET", names(survey))]
  
  if (grepl("2023", survey_year)){
    survey.keys <- survey %>%
      mutate(KEY_Household = HHS_KEY,
             KEY_Mother = paste(HHS_KEY, qa102_annee, qa102_mois, qa102_jour, sep = "_"),
             KEY_Child = paste(KEY_Mother, vs25, vs20, cod, sep = "_"))
  } else {
    survey.keys <- survey %>%
      mutate(KEY_Household = PARENT_KEY,
             KEY_Mother = paste(PARENT_KEY, qa102_annee, qa102_mois, qa102_jour, sep = "_"),
             KEY_Child = paste(KEY_Mother, vs25, vs20, cod, sep = "_"))
  }
  
  # Suppression des doublons sur la base des clefs enfants 
  # (i.e. same household + mother + unique code + age + sex)
  survey.keys.d <- remove_duplicates(survey.keys, c("KEY_Child"))
  
  # Consistency of registered information = for one key (mother or household),
  # are all rows consistent where it matters?
  ## Mother
  diverging_answers_complete <- trier_doublons_par_cle(survey.keys.d, "KEY_Mother", 
                                                       retour = "list")
  
  survey.keys.i.m <- diverging_answers_complete$donnees
  
  ## Household
  diverging_answers_hh <- trier_doublons_par_cle(survey.keys.i.m, "KEY_Household", 
                                                       retour = "list")

  # Duplicates verifications: is there duplicated rows based on answers or technical
  # information of the survey, and not keys? 
  survey.keys.i.d <- remove_duplicates_based_on_answers(diverging_answers_hh$donnees,
                                                        rules = rules_for_preprocessing_steps)
  
  
  survey.keys.i.d <- survey.keys.i.d %>%
    mutate(ecv = survey_year)

  ecv_data[[i]] <- survey.keys.i.d 
  
  i <- i + 1
}


# Change column type for future merge
ecv_data <- purrr::map(ecv_data, ~ mutate(.x, vs25a = as.character(vs25a)))
ecv_data <- purrr::map(ecv_data, ~ mutate(.x, q117 = as.character(q117)))
ecv_data <- purrr::map(ecv_data, ~ mutate(.x, q118 = as.character(q118)))
ecv_data <- purrr::map(ecv_data, ~ mutate(.x, qa618a = as.character(qa618a)))

# Agregation of the complete dataset
ecv_data <- bind_rows(ecv_data)

ecv_data <- ecv_data %>%
  mutate(id = 1:n()) %>%
  mutate(carnet_de_sante_disponible = case_when(vs26 %in% c("1", "2", "3")  & vs27 %in% c("1", "2", "3") ~ T,
                                                T ~ F)) %>%
  filter(vs25 > 6 | vs25 < 24) # Suppression des enfants de moins de 6 mois ou de plus de 23 (normalement non interrogés)

# Response variables
ecv_data.vr <- compute_variables_reponses(ecv_data)

# Covariates
ecv_data.cov_hz <- compute_covariables_ECV_HZ_level(ecv_data, pyramide_sanitaire)
ecv_data.cov_hh <- compute_covariables_ECV_HH_level(ecv_data, ecv_data.cov_hz)


# Merge
data_comp <- ecv_data.vr %>%
  full_join(ecv_data.cov_hh, by = "id") 