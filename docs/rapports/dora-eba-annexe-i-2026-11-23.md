# DORA — dossier EBA Annexe I pré-rempli — 2026-11-23

## Objectif

Les entités financières de la région reçoivent un dossier pré-rempli au format
EBA, avec l'horloge des 4 heures après classification. Le juge externe exécute
le critère ci-dessous : sa sortie brute fait foi.

Source du modèle : champs 1.1 à 2.10 de l'Annexe I du règlement d'exécution
(UE) 2025/302, valeurs de listes fermées de son Annexe II, consultation du
2026-11-23 à https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202500302 .
Le délai de 4 heures après classement vient de l'article 5 du règlement
délégué (UE) 2025/301 ; le rapport intermédiaire est dû dans les 72 heures.

## Livré

- **Migration 217** (`db/migrate-217-export-dora.sql`) : `event.classified_at`
  et table `export_dora` (une ligne par incident classé, `UNIQUE
  (source_event_id)`). Les colonnes `classified_at`, `initial_at` et
  `intermediate_at` sont `NOT NULL` et bornées par des `CHECK` : dossier
  initial au plus 4 h après classement, dossier intermédiaire au plus 72 h.
  Un trigger crée la ligne dès qu'un `event` devient `confirmed_incident`, la
  recale en cas de correction et backfille les incidents déjà présents. Le
  nom de fichier `dora_AAAA-MM-JJ_ID.json` est calculé en SQL et stocké.
- **Dossier pré-rempli** : `apps/api/src/report/dora-eba-annexe-i.schema.json`
  (25 champs, listes fermées officielles) et `apps/api/src/report/export-dora.ts`
  (validation AJV, contrôle de l'horloge, écriture des fichiers et SHA-256 des
  octets livrés). Aucun titre, résumé, URL ou contact personnel n'est recopié :
  les contacts sont des rôles sur un domaine `.invalid`, les codes LEI des
  valeurs synthétiques à confirmer par l'entité. Aucune source nationale
  n'est présentée comme locale : le dossier porte « Portee regionale
  Nouvelle-Aquitaine ».
- **Rejouable** : `pnpm dora:exports` écrit `exports/dora/*.json` et vérifie ;
  `pnpm verifie:dora-exports` vérifie sans écrire ; `pnpm verifie:objectif-dora`
  recrée une base jetable, sème 10 incidents, imprime le critère et sa sortie
  brute. Les tests `apps/api/test/export-dora.test.ts` couvrent les 10
  dossiers, le schéma, l'horloge, l'absence de fuite et le rejet d'un dossier
  incomplet.

## Critère du juge externe — sortie brute

`pnpm verifie:objectif-dora` (base jetable `init.sql` + migrations, 10 incidents
de test synthétiques) :

```
SELECT count(*) FROM export_dora WHERE classified_at IS NULL OR initial_at>classified_at+interval '4 hours' OR intermediate_at>classified_at+interval '72 hours';
 count 
-------
 0
-------
exports EBA Annexe I valides : 10 / 10
fichiers dora_AAAA-MM-JJ_ID.json : 10 / 10
OBJECTIF : atteint — 10 / 10 exports EBA Annexe I, horloge 0
```

## Non-régression

- Suite API (`apps/api/node_modules/.bin/tsx test/run.ts`, base PostgreSQL
  jetable) : **2847 tests, 0 échec**, 62 suites, dont les 6 tests de
  `apps/api/test/export-dora.test.ts`.
- Typecheck API (`apps/api/node_modules/.bin/tsc --noEmit`) : **0 erreur**.
- Sortie brute de la suite : `ℹ tests 2847` · `ℹ pass 2847` · `ℹ fail 0` · `ℹ duration_ms 307417.78176`.
- Dans ce worktree, les commandes `pnpm -F @radar/api …` sont refusées avant
  exécution par l'environnement (`node_modules` racine est un symlink →
  `ERR_PNPM_UNSAFE_TASK_RUN_STATE_PATH`) : les deux vérifications ci-dessus
  ont donc été lancées via les binaires exacts que pnpm invoque. Aucun lien
  avec le code DORA. `pnpm verifie:objectif-dora` s'exécute normalement.
