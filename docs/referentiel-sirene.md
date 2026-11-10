# Référentiel SIRENE (organisations)

**Source** : API publique [recherche-entreprises.api.gouv.fr](https://recherche-entreprises.api.gouv.fr/) (DINUM/Etalab, base SIRENE INSEE). Aucune clé requise. Données alternatives complètes : data.gouv.fr / INSEE, Sirene (CSV/Parquet par département), licence **Licence Ouverte v2.0 (Etalab)**.

**Script** : `scripts/import-sirene.mts` — `--dry-run` par défaut, `--apply` pour insertion idempotente, `--dept=33,64,...` pour cibler (défaut: 12 départements Nouvelle-Aquitaine), `--per-naf` et `--max-pages` pour borner le volume.

**Filtres NAF retenus** (veille cyber : entités avec SI critiques/publics exposés, une org sans SI n'apporte rien au graphe) :
- `62.02A` Conseil en SI/logiciels, `62.09Z` autres activités informatiques, `61.10Z` télécoms filaires, `63.11Z` hébergement/données — opérateurs & prestataires numériques (surface d'attaque, incidents supply-chain).
- `84.11Z/84.12Z/84.13Z/84.30A/84.30B/84.30C` administrations publiques et sécurité sociale — services essentiels, données sensibles.
- `85.20Z/85.31Z/85.32Z/85.42Z` enseignement (primaire→supérieur) — grands parcs informatiques, cibles fréquentes.
- `86.10Z/86.21Z/86.22A/86.22B/86.22C` santé (hôpitaux, médecins, imagerie/chirurgie) — SI critiques et données de santé.

**Déduplication** : rejet si `slug` identique ou nom normalisé déjà présent en base. Insertion SQL garde-fou `WHERE NOT EXISTS` sur slug/nom normalisé (contrainte unique `org_slug_key`), donc `--apply` est idempotent et rejouable.

**Import exécuté (2026-11-10)** : 12 départements Nouvelle-Aquitaine, `--apply`, per-naf=50, max-pages=10 → 21 597 lues, 8 467+6 retenues, 7 110 nouvelles, 1 921+558 déjà présentes, 385 rejetées filtre. Table `org` : 588 → 7 698 (une page `84.12Z` du dept 19 perdue sur ECONNRESET, comblée par relance ciblée `--dept=19`, +6).

**Volume attendu** : ordre de grandeur ~10³–10⁴ établissements pertinents par département selon le tissu économique (Gironde/Pyrénées-Atlantiques en haut). L'import se fait par (dept, NAF) paginé et plafonné (`--per-naf`, défaut 50) pour rester maîtrisé ; exécuter NAF par NAF/département puis consolider. Coordonnées lat/lng non renseignées par cette source — relancer `scripts/geocode-orgs.mts` après import.
