# Calibration des 8 règles actives — seuils sur courbe précision/rappel

Mesure du 22 novembre 2026. Objectif : réduire les **1 457 alertes** des 30
derniers jours sans perdre plus de 40 % des incidents confirmés de la fenêtre.
Chaque règle retient le **seuil le plus élevé** qui garde
`précision >= 0,85` et `rappel >= 0,60`.

## Les 8 règles actives

Sept règles JSON de `db/detection-rules.sql` — `incident-confirme`,
`ransomware-revendication`, `avis-cert-fr`, `fuite-donnees`,
`certificat-observé`, `presse-cyber`, `operateur-critique-vise` — plus la
règle pure de supervision `supervision:silent-source-24h`
(`apps/api/src/detect/silent-source.ts`).

Les écrivains d'alertes analytiques `rupture:*` (`apps/api/src/analyse/rupture.ts`)
et `agents-cpu:*` (`apps/api/src/analyse/agents-cpu.ts`) ne passent pas par
`detection_rule` : ils restent hors du périmètre calibré et gardent leur
comportement. Ils ont émis 7 alertes sur la fenêtre, comptées dans les 1 457
mais pas dans `sum(alerts)`. Le vrai total après seuils est donc
**1 242 + 7 = 1 249**, mesuré par la requête de projection ci-dessous.

## Méthode

- **Holdout** : alertes créées sur 30 jours (`created_at >= now() - interval
  '30 days'`) — 1 457 alertes au moment de la mesure.
- **Vérité terrain** : verdicts déjà enregistrés, jamais rejugés ici. Une
  alerte est positive si son événement n'est ni dans `false_event` ni marqué
  `evidence.false_event` ; négative sinon.
- **Score balayé** : note de confiance de l'alerte, majorée de **30** quand un
  ancrage Nouvelle-Aquitaine est observable (`org_id` ou `regional`) — le
  même signal que la porte de portée, sans donnée personnelle.
- **Règle de supervision** : score = durée de silence mesurée
  (`evidence.silenceHours`), pas de note de confiance.
- **Rappel** : part des *alertes vraies déjà émises* que le seuil conserve.
  Il mesure ce que la calibration retire, pas la couverture des incidents
  qu'aucune alerte n'avait détectés — un incident jamais alerté n'est pas
  « perdu » par un seuil plus haut.

## Résultat mesuré

| Règle | Seuil | Précision | Rappel | Alertes gardées |
|---|---:|---:|---:|---:|
| `incident-confirme` | 100 | 1,0000 | 0,8901 | 1 142 |
| `ransomware-revendication` | 78 | 0,9038 | 0,6620 | 52 |
| `avis-cert-fr` | 81 | 0,9583 | 0,9583 | 24 |
| `supervision:silent-source-24h` | 14 | 1,0000 | 1,0000 | 24 |
| `fuite-donnees` | 65 | 1,0000 | 1,0000 | 0 |
| `certificat-observé` | 65 | 1,0000 | 1,0000 | 0 |
| `presse-cyber` | 65 | 1,0000 | 1,0000 | 0 |
| `operateur-critique-vise` | 65 | 1,0000 | 1,0000 | 0 |

**8/8 règles qualifient ; somme des alertes = 1 242 < 1 457.**

Les quatre règles à 0 alerte n'ont émis aucune alerte sur la fenêtre : leur
seuil d'origine est conservé, aucune alerte n'est supprimée, donc aucun
incident confirmé n'est perdu. Leurs métriques 1/1 sont une décision vacante,
pas une mesure statistique — la colonne `source` porte
`holdout-30j:sans-observation`.

## Application par le moteur

Le moteur de détection (`apps/api/src/detect/engine.ts`) charge la table dans
`loadRuleThresholds()` et compare chaque règle à son seuil :

- **score calibré** = note de confiance de l'alerte + `30` quand un ancrage
  Nouvelle-Aquitaine est observable (`org_id` ou `regional`) — exactement
  l'échelle sur laquelle les seuils ont été mesurés ;
- **plancher inchangé** : la porte globale `REVIEW_THRESHOLD = 65` reste
  appliquée avant les règles. Un seuil calibré ne peut donc que resserrer,
  jamais rouvrir une alerte que la porte refusait ;
- **règle sans mesure** : aucun seuil en table, comportement d'origine ;
- **preuve** : l'alerte créée porte `evidence.calibration = { score, threshold,
  anchored }` pour que la décision soit auditable.

La règle de supervision lit son seuil dans la même table
(`silent-source-monitor.ts`, en heures) et retombe sur la constante
historique de 12 h si la mesure est absente.

## Rejouer

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-rule-calibration.mts
```

Le script met à jour `rule_calibration`, publie
`bench/results/rule-calibration-30d.json` et affiche le contrôle :

```sql
SELECT count(*) FROM rule_calibration WHERE precision>=0.85 AND recall>=0.6; -- 8
SELECT sum(alerts) FROM rule_calibration;                                   -- 1242
```

Projection sur les alertes réelles de la fenêtre (seuils appliqués, règles non
calibrées conservées) — 1 457 → 1 249, 208 retirées :

```sql
WITH scored AS (
  SELECT a.rule_id,
         CASE WHEN a.rule_id = 'supervision:silent-source-24h'
              THEN (a.evidence->>'silenceHours')::numeric
              ELSE coalesce(a.evidence->'confidence'->>'score','0')::numeric
                   + CASE WHEN a.event_id IS NOT NULL AND (e.regional OR e.org_id IS NOT NULL) THEN 30 ELSE 0 END
         END AS score
    FROM alert a LEFT JOIN event e ON e.id = a.event_id
   WHERE a.created_at >= now() - interval '30 days'
)
SELECT count(*) AS alertes_30j,
       count(*) FILTER (WHERE rc.rule_id IS NULL OR s.score >= rc.threshold) AS projetees,
       count(*) FILTER (WHERE rc.rule_id IS NOT NULL AND s.score < rc.threshold) AS retirees
  FROM scored s LEFT JOIN rule_calibration rc ON rc.rule_id = s.rule_id;
```

## Limites

- La vérité terrain vient des verdicts `false_event` déjà enregistrés : elle
  mesure la pertinence Nouvelle-Aquitaine, pas la gravité de l'incident.
- Les quatre règles sans alerte ne sont pas mesurables statistiquement sur
  cette fenêtre ; leur qualification est vacante et documentée.
- Aucun titre, URL, identifiant de victime ou secret n'est lu ni stocké par
  la mesure. Le corpus national n'est jamais présenté comme local.
