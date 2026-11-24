# Rapports NIS2 intermédiaire et final — 2026-11-23

## Objectif

Le même incident confirmé alimente automatiquement la notification à 72 heures
et le rapport final à un mois, sans ressaisie. Le juge externe exécute le
critère SQL ci-dessous : sa sortie brute fait foi.

## Livré

- **Migration 215** (`db/migrate-215-nis2-rapports.sql`) : table
  `notification_brouillon` (deux lignes par incident, `regime` dans
  `NIS2_72h` / `NIS2_1mois`, `echeance`, `payload` JSONB avec `contexte`,
  `impact`, `mesures` non vides par `CHECK`, `source_event_id` obligatoire).
  Un trigger sur `event` crée les deux brouillons dès qu'un fait devient
  `confirmed_incident` ; une correction de la date de l'incident recale les
  deux échéances. Les incidents déjà présents sont backfillés. Aucun titre,
  résumé, URL ou identité n'est recopié dans le payload.
- **Exports datés** : `rapport_nis2_export` stocke, par incident et par régime,
  la date d'émission, les trois sections et le contenu exact avec son empreinte
  SHA-256. `apps/api/src/report/nis2-rapports.ts` échoue fermé si une section
  manque et rend trois chapitres : *Contexte et nature de l'incident*, *Impact*,
  *Mesures prises* — les mesures différant entre l'étape 72 h et l'étape finale.
  La portée affichée est calculée depuis `source.region` / `source.department`
  (`nationale`, `locale`, `régionale` ou `portée non déclarée`) : une source
  nationale n'est jamais présentée comme locale.
- **Rejouable** : `pnpm nis2:rapports` écrit `exports/nis2/*.md` et vérifie ;
  `pnpm verifie:nis2-rapports` vérifie sans écrire. Les tests
  `apps/api/test/nis2-rapports.test.ts` couvrent la création des deux
  brouillons, le critère brut, les deux exports datés, le recalage des
  échéances, le rejet d'un brouillon incomplet et la portée nationale non
  présentée comme locale.

## Critère du juge externe — sortie brute

Base jetable recréée depuis `init.sql` + migrations, un seul incident de test
inséré (`2026-11-20T08:00:00Z`, gravité 4/5), puis exécution littérale :

```
SELECT count(*) FROM notification_brouillon WHERE regime IN ('NIS2_72h','NIS2_1mois') AND (echeance IS NULL OR payload->>'mesures' IS NULL OR payload->>'impact' IS NULL OR source_event_id IS NULL);
 count 
-------
 0
-------
```

## Deux exports datés de l'incident de test

`exports/nis2/rapport-nis2-nis2_72h-16-2026-11-23T20-29-27-211Z.md` et
`exports/nis2/rapport-nis2-nis2_1mois-16-2026-11-23T20-29-27-211Z.md`, émis le
`2026-11-23T20:29:27.211Z`, échéances respectives `2026-11-23T08:00:00.000Z`
et `2026-12-20T08:00:00.000Z` :

```
# Rapport NIS2 intermédiaire (72 heures)

- Incident source : 16
- Date d'émission : 2026-11-23T20:29:27.211Z
- Échéance de notification : 2026-11-23T08:00:00.000Z
- Périmètre de la source : nationale

## 1. Contexte et nature de l'incident

Incident confirmé — famille ransomware, gravité 4/5. Fait enregistré le 2026-11-20T08:00:00.000Z par la source test:nis2verif:nationale. Département : 33.

## 2. Impact

Impact fonctionnel déclaré : majeur (gravité 4/5, qualification B2). Seuls des champs structurés sont repris : aucun récit de victime ni donnée personnelle.

## 3. Mesures prises

Mesures immédiates : qualifier et dater l'incident, conserver les preuves, contenir les effets observés et transmettre la notification intermédiaire à l'autorité compétente.
```

Le rapport final porte le même contexte et le même impact, avec les mesures
consolidées et l'échéance d'un mois. Contrôle du script :

```
"exports": 16,
"incidents_avec_deux_rapports": 8,
"sections_manquantes": [],
"critique": "OK"
```

(16 exports = 8 incidents confirmés présents dans la base jetable, dont
l'incident de test ; deux rapports par incident.)

## Non-régression

- Suite API complète sur une base PostgreSQL dédiée (le lanceur `pnpm` racine
  refuse ce worktree : `ERR_PNPM_UNSAFE_TASK_RUN_STATE_PATH`, `node_modules`
  étant un symlink du harnais) : `tsx test/run.ts` → **2794 tests, 2794 pass,
  0 fail, exit 0** (sortie brute : `ℹ tests 2794` / `ℹ pass 2794` / `ℹ fail 0`).
- Typecheck API (`tsc --noEmit`, script derrière `pnpm -F @radar/api typecheck`) :
  exit 0, aucune erreur.
- Les marqueurs privés insérés dans le titre et le résumé de l'incident de test
  (`VICTIM_NAME_MARKER`, `RESUME_MARKER`, URL d'article) n'apparaissent dans
  aucun brouillon ni export (`grep` : aucun résultat).
