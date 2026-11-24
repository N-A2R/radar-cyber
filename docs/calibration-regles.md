# Calibration des 8 règles actives — seuils sur courbe précision/rappel

OBJECTIF : partiel — 1 440 alertes conservées sur 1 607, 166/1 532 alertes vraies supprimées (10,84 %) / < 1 607 alertes et ≤ 40 % de perte, avec 8/8 règles qualifiant (précision ≥ 0,85, rappel ≥ 0,60), manque 1 règle sans seuil qualifiant, 4 règles sans observation

Mesure rejouée le 24 novembre 2026 sur `radar`, en lecture seule, sur
l'échelle non majorée décrite ci-dessous. Les chiffres du 22 novembre étaient
calculés avec la majoration d'ancrage de 30 dans le score balayé : ils ne
sont plus citables. Le tableau `rule_calibration` n'a pas été modifié par ce
rejeu ; ses seuils restent ceux de la migration 200.

## Les 8 règles actives

Sept règles JSON de `db/detection-rules.sql` — `incident-confirme`,
`ransomware-revendication`, `avis-cert-fr`, `fuite-donnees`,
`certificat-observé`, `presse-cyber`, `operateur-critique-vise` — plus la
règle pure de supervision `supervision:silent-source-24h`
(`apps/api/src/detect/silent-source.ts`).

Vingt-sept alertes de la fenêtre viennent d'écritures hors `detection_rule`
(20 `orientation-collectivite-demo-*`, 3 `rupture:changement-nature`,
3 `rupture:rafale`, 1 `agents-cpu:bascule-secteur`). Elles sont comptées dans
le holdout et la projection, jamais dans les métriques par règle.

## Méthode

- **Holdout** : les 1 607 alertes dont `created_at >= now() - interval '30
  days'` au moment du rejeu. Les horodatages observés couvrent le 13 au 23
  novembre 2026 ; la fenêtre SQL reste définie par `now()` au moment du rejeu.
- **Vérité terrain** : verdicts déjà enregistrés, jamais rejugés ici. Une
  alerte est positive si `false_event.event_id = alert.event_id` ne donne
  aucun verdict et si `evidence` ne porte pas `false_event` ; négative sinon.
- **Score balayé** : note de confiance **non majorée**
  (`evidence->'confidence'->>'score'`) — c'est l'échelle comparée aux seuils
  de règle et à la porte globale `REVIEW_THRESHOLD = 65`. La majoration de 30
  d'un ancrage Nouvelle-Aquitaine est tracée dans l'evidence, jamais comparée
  à un seuil.
- **Règle de supervision** : score = durée de silence mesurée
  (`evidence.silenceHours`), en heures.
- **Seuil retenu** : le plus élevé qui garde `precision >= 0,85` et
  `recall >= 0,60`. Quand aucun point de la courbe ne satisfait les deux
  contraintes, le rapport enregistre `sans-seuil-qualifiant` et **aucun
  seuil n'est fabriqué**.
- **Rappel** : part des *alertes vraies déjà émises* que le seuil conserve.
  Il mesure ce que la calibration retire, pas la couverture des incidents
  qu'aucune alerte n'avait détectés.

## Résultat mesuré (24 novembre 2026)

| Règle | Statut | Seuil | Précision | Rappel | Alertes gardées | Alertes observées | Vraies gardées / observées |
|---|---|---:|---:|---:|---:|---:|---:|
| `incident-confirme` | mesure | 100 | 1,0000 | 0,8901 | 1 142 | 1 283 | 1 142 / 1 283 |
| `ransomware-revendication` | sans seuil qualifiant | — | — | — | 118 (inchangées) | 118 | 71 / 71 |
| `avis-cert-fr` | mesure | 81 | 1,0000 | 0,9167 | 22 | 25 | 22 / 24 |
| `supervision:silent-source-24h` | mesure | 19 | 1,0000 | 0,8506 | 131 | 154 | 131 / 154 |
| `fuite-donnees` | sans observation | — | — | — | 0 | 0 | 0 / 0 |
| `certificat-observé` | sans observation | — | — | — | 0 | 0 | 0 / 0 |
| `presse-cyber` | sans observation | — | — | — | 0 | 0 | 0 / 0 |
| `operateur-critique-vise` | sans observation | — | — | — | 0 | 0 | 0 / 0 |

**3 règles qualifient, 1 règle est observée sans seuil qualifiant, 4 règles
n'ont aucune observation sur la fenêtre.** L'objectif reste donc partiel,
malgré une réduction de 167 alertes et une perte de 10,84 % des alertes vraies
(déjà enregistrées), sous la limite de 40 %.

`ransomware-revendication` a 118 observations (71 positives, 47 négatives).
Sur l'échelle non majorée, la précision maximale avec un rappel ≥ 0,60 est
0,6017 (seuil 48, 118 alertes gardées) : aucun seuil n'atteint 0,85 sans
descendre sous 0,60 de rappel. Le seuil 78 en table vient de l'ancienne
échelle majorée ; il n'est pas réappliqué ici.

Les quatre règles sans observation n'ont émis aucune alerte : aucune mesure
statistique, ni précision ni rappel calculables. Le JSON porte `statut =
"sans-observation"`, `precision = null`, `recall = null`, et non des
métriques 1/1 qui simuleraient une qualification. Leurs seuils en table
restent inchangés (65).

## Application par le moteur

Le moteur (`apps/api/src/detect/engine.ts`) charge la table dans
`loadRuleThresholds()` et distingue deux échelles :

- **seuil de règle** : comparé à la note de confiance **non majorée** de
  l'alerte, la même échelle que la mesure ;
- **porte globale** : `REVIEW_THRESHOLD = 65` s'applique à cette même note
  non majorée ; l'ancrage (`org_id` ou `regional`) n'abaisse ni la porte ni
  les seuils de règle ;
- **règle sans mesure** : aucun seuil en table, comportement d'origine ;
- **preuve** : l'alerte porte `evidence.calibration = { score, globalScore,
  threshold, anchored }`. `score` est la note comparée aux seuils ;
  `globalScore = score + 30 si ancrage` est une trace, pas un critère.

La règle de supervision lit son seuil dans la même table, en heures. Ce rejeu
ne modifie ni la table, ni le comportement de production : appliquer les
nouveaux seuils exigerait une migration dédiée, absente de ce chantier.

## Rejouer

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-rule-calibration.mts
```

Le script effectue uniquement des `SELECT` sur la base, puis publie
`bench/results/rule-calibration-30d.json` avec l'horodatage réel de la mesure
(`generatedAt`, `measuredAt`) et un instantané des seuils live inchangés.

La ligne OBJECTIF est vérifiée en lecture seule depuis l'artefact et ce
rapport :

```bash
pnpm verifie:objectif-calibration
```

Elle affiche la déclaration et son adéquation avec l'artefact ; la commande
sort en code 1 tant que l'objectif reste partiel, ce qui est le cas de la
mesure du 24 novembre.

Projection sur les alertes réelles de la fenêtre, en appliquant **uniquement
les 3 seuils qualifiants mesurés** (les autres règles sont conservées) —
1 607 → 1 440, 167 alertes retirées. Sur le périmètre des 8 règles, les
1 532 alertes vraies passent à 1 366 (166 retirées) ; avec les 27 alertes
hors périmètre, le total des vraies passe de 1 559 à 1 393 :

```sql
WITH seuils(rule_id, threshold) AS (
  VALUES ('incident-confirme', 100),
         ('avis-cert-fr', 81),
         ('supervision:silent-source-24h', 19)
)
SELECT count(*) AS alertes_30j,
       count(*) FILTER (WHERE s.seuil IS NULL OR s.score >= s.seuil) AS projetees,
       count(*) FILTER (WHERE s.seuil IS NOT NULL AND s.score < s.seuil) AS retirees
  FROM (
    SELECT a.rule_id,
           CASE WHEN a.rule_id = 'supervision:silent-source-24h'
                THEN coalesce((a.evidence->>'silenceHours')::numeric, 0)
                ELSE coalesce((a.evidence->'confidence'->>'score')::numeric, 0)
           END AS score,
           v.threshold AS seuil
      FROM alert a LEFT JOIN seuils v ON v.rule_id = a.rule_id
     WHERE a.created_at >= now() - interval '30 days'
  ) s;
```

Contrôle de non-modification du live (8 lignes, `measured_at` encore au
22 novembre) :

```sql
SELECT count(*) FROM rule_calibration;                                  -- 8
SELECT min(measured_at)::date FROM rule_calibration;                   -- 2026-11-22
```

## Limites

- La vérité terrain vient des verdicts `false_event` déjà enregistrés : elle
  mesure la pertinence Nouvelle-Aquitaine, pas la gravité de l'incident.
- Une règle sans observation n'a ni précision ni rappel mesurables ; une
  règle observée sans seuil qualifiant n'a pas de seuil mesurable non plus.
  Les deux cas sont exclus du nombre de règles qualifiantes.
- Le holdout contient 27 alertes de règles hors périmètre calibré, laissées
  intactes et comptées dans la projection, pas dans le dénominateur de rappel
  des 8 règles.
- Aucun titre, URL, identifiant de victime ou secret n'est lu ni stocké par
  la mesure. Le corpus national n'est jamais présenté comme local.
