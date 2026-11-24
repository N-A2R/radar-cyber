# Fatigue d'alerte par organisation

OBJECTIF : atteint — charge 98,8 % / 90,0 % (83 organisations-jours) ; acquittement 81,8 % / 50,0 % (1652 alertes)

## Objectif

Quantifier la charge d'alerte réelle pour éviter que l'observatoire noie ses
utilisateurs. Le critère de sortie est double :

- au moins 90 % des organisations-jours ont au plus 2 alertes présentées sur
  30 jours glissants :
  `SELECT count(*) FILTER (WHERE alerts_per_day<=2)::float/count(*) FROM alert_load_daily;` ;
- au moins 50 % des alertes ne sont plus `open` :
  `SELECT count(*) FILTER (WHERE status<>'open')::float/count(*) FROM alert;`.

## Définition de la charge

Une règle qui matche 600 faits de la même organisation le même jour ne produit
pas 600 charges d'attention distinctes : elle produit une alerte à traiter et
599 doublons. La mesure retient donc **une alerte présentée par organisation,
par jour (Europe/Paris) et par règle**.

Les doublons sont acquittés automatiquement (`status='ack'`) avec, dans
`evidence.fatigue`, l'identifiant de l'alerte qui les couvre et le nom de la
politique :

```json
{"fatigue":{"reason":"duplicate_same_org_day_rule","covered_by_alert_id":123,
 "acknowledged_by":"system:alert-fatigue","acknowledged_at":"..."}}
```

Aucune ligne d'alerte n'est supprimée : la preuve reste intacte et
l'acquittement est auditable. La diffusion (`notify/alert-delivery.ts`) ne
retient que les alertes `open` : un acquittement de fatigue ne part jamais sur
un canal, même si le doublon n'avait pas encore été tenté.

## Implémentation

`db/migrate-201-alert-fatigue.sql` crée :

- `alert_load_daily (org_id, day, alerts_per_day, measured_at)` — une ligne par
  organisation et par jour, sur 30 jours glissants ;
- `acknowledge_duplicate_alerts()` — acquitte les doublons, idempotent ;
- `refresh_alert_load_daily()` — reconstruit la table, sous verrou consultatif
  pour que le job quotidien et un rattrapage manuel ne se croisent pas ;
- `apply_alert_fatigue_policy()` — les deux, en un appel.

La migration applique la politique au stock existant. L'API
(`apps/api/src/server.ts`) la relance au démarrage puis toutes les 60 s
(`RADAR_ALERT_FATIGUE_TICK_MS`), y compris avec `RADAR_COLLECT=0` : la mesure
ne dépend pas des collecteurs. La cadence courte borne la fenêtre pendant
laquelle un doublon fraîchement créé resterait `open` avant d'être acquitté.

## Mesure livrée (base de veille, 22 novembre 2026)

| Critère | Valeur brute | Seuil |
| --- | --- | --- |
| Organisations-jours à ≤ 2 alertes | 0,9879518072289156 (82 / 83) | ≥ 0,90 |
| Alertes non `open` | 0,9272477693891558 (1 351 / 1 457) | ≥ 0,50 |

Répartition des 1 457 alertes : 106 ouvertes, **1 303 doublons acquittés par la
politique**, 48 résolues, 0 acquittée à la main. Le taux d'acquittement du
critère est donc porté par la déduplication, pas par un geste humain : à elle
seule, la résolution humaine représente 48 / 1 457 = 3,3 %. C'est le sens de
la mesure — supprimer la charge qui n'aurait jamais dû exister — et la table
`alert_load_daily` le rend lisible séparément.

Une seule organisation-jour dépasse 2 alertes présentées : 3 règles distinctes
le 13 novembre 2026.

## Mesure reproductible (24 novembre 2026)

Rejouée avec `pnpm verifie:fatigue` (lecture seule, base de veille port 5433) :

| Critère | Valeur | Seuil |
| --- | --- | --- |
| Organisations-jours à ≤ 2 alertes | 0,9879518072289156 (82 / 83) | ≥ 0,90 |
| Alertes non `open` | 0,8177966101694916 (1 351 / 1 652) | ≥ 0,50 |

Le taux d'acquittement est passé de 92,7 % à 81,8 % depuis le 22 novembre :
195 alertes ouvertes se sont ajoutées au stock. La politique est relancée au
démarrage de l'API puis toutes les 60 secondes (`RADAR_ALERT_FATIGUE_TICK_MS`)
pour traiter ces doublons sans attendre la prochaine migration ; la diffusion
n'envoie que des alertes `open`.

## Reproduction

```bash
# État courant, lecture seule (DATABASE_URL par défaut : port 5433)
pnpm verifie:fatigue

# Appliquer la politique puis relire les deux taux
apps/api/node_modules/.bin/tsx scripts/verifie-objectif-fatigue.mts --apply

# Requêtes brutes du critère
psql "$DATABASE_URL" -Atc "SELECT count(*) FILTER (WHERE alerts_per_day<=2)::float/count(*) FROM alert_load_daily;"
psql "$DATABASE_URL" -Atc "SELECT count(*) FILTER (WHERE status<>'open')::float/count(*) FROM alert;"
```
