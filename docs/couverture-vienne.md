# Couverture de la Vienne — mesure du 21 novembre 2026

Mesure rejouée avec `scripts/couverture-dept.mts` sur la base
`postgres://radar:radar@localhost:5433/radar`. Le corpus est
`bench/corpus/incidents-vienne.jsonl` : 8 incidents, tous déclarés dans le
département `Vienne`. Aucun chiffre ci-dessous n'est estimé : les comptes, le
taux et la médiane sont calculés par la requête SQL unique du script (CTE
`faits` et `synthese`), pas par le code TypeScript.

## Résultat

| Mesure | Valeur | Calcul SQL |
| --- | --- | --- |
| Incidents du corpus Vienne | **8** | `count(*)` sur la CTE `corpus` filtrée sur `departement = 'Vienne'` |
| Rattachés à une organisation du 86 | **0** | `count(*) FILTER (WHERE motif = 'vu')` |
| Taux de couverture | **0,0 %** | `round(100.0 * vus / total, 1)` |
| Délai médian de détection | **non mesuré** | `percentile_cont(0.5) WITHIN GROUP (ORDER BY delai_jours) FILTER (WHERE motif = 'vu')` = `NULL` (aucun incident rattaché) |
| `pas_collecte` | **7** | `count(*) FILTER (WHERE motif = 'pas_collecte')` |
| `pas_rattache` | **1** | `count(*) FILTER (WHERE motif = 'pas_rattache')` |
| `pas_juge_cyber` | **0** | `count(*) FILTER (WHERE motif = 'pas_juge_cyber')` |
| Organisations du département 86 | **96 750** | `SELECT count(*) FROM org WHERE dept = '86'` |

Le délai médian est donc indéfini pour cette mesure : il n'existe aucun incident
« vu » sur lequel le calculer. Le publier à `0 j` serait faux.

## Tableau nominatif

| Incident | Organisation visée | Publication | Motif | Trace radar | Organisation rattachée | Délai |
| --- | --- | --- | --- | --- | --- | --- |
| `na-vienne-001` | Association Accord — festival Jazzellerault (Châtellerault) | 2024-07-03 | `pas_collecte` | aucun événement | — | — |
| `na-vienne-002` | Ville de Poitiers — site internet municipal | 2025-01-02 | `pas_collecte` | aucun événement | — | — |
| `na-vienne-003` | Ville de Poitiers — Grand Poitiers — CCAS | 2025-09-05 | `pas_collecte` | aucun événement | — | — |
| `na-vienne-004` | Vivaticket France (Chasseneuil-du-Poitou) | 2026-03-15 | `pas_collecte` | aucun événement | — | — |
| `na-vienne-005` | Académie de Poitiers — rectorat | 2026-08-31 | `pas_collecte` | aucun événement | — | — |
| `na-vienne-006` | Intermarché de Chauvigny et Gençay, Super U de Vouillé, Leclerc de Poitiers | 2026-10-12 | `pas_rattache` | événement `77192` — *Cyberattaque contre des frigos dans les supermarchés…* (Midi Libre, similarity 0,356) | aucune (`event.org_id` NULL) | — |
| `na-vienne-007` | Grand Poitiers — régie des parkings | 2026-01-22 | `pas_collecte` | aucun événement | — | — |
| `na-vienne-008` | Auchan Saint-Genest-d'Ambière | 2026-10-15 | `pas_collecte` | aucun événement | — | — |

Le seul incident collecté (`na-vienne-006`) est couvert au niveau national par
une dizaine d'articles sur l'attaque des frigos de supermarchés, mais le
candidat retenu n'a pas d'`org_id` : la dimension « Vienne » du fait n'a pas été
rattachée. Les sept autres n'ont aucun équivalent dans `event`, ni par URL
source exacte, ni par similarité de titre dans la fenêtre ±45 jours.

## Méthode

Un incident est dit `vu` seulement si trois conditions SQL sont réunies :

1. **collecté** — un événement de `event` partage son URL source exacte, ou a un
   titre proche (`pg_trgm`, similarité ≥ 0,25) dans les 45 jours autour de la
   publication ;
2. **jugé cyber** — la famille de l'événement appartient aux huit familles cyber
   présentes dans `event` (`cert`, `cert_fr`, `cti`, `leaks`, `paste`,
   `presse_cyber`, `ransomware`, `vuln`) ;
3. **rattaché au département** — l'`org_id` de l'événement pointe vers une
   organisation dont `org.dept = '86'`.

En cas de plusieurs événements candidats, le SQL privilégie celui rattaché au
86, puis la plus forte similarité, puis la collecte la plus ancienne. Le délai
de détection est `event.created_at::date - date_publication`, en jours, et
n'est calculé que pour les incidents `vu`. Les motifs d'absence reprennent
ceux de `apps/api/src/analyse/couverture.ts` : `pas_collecte`, `pas_rattache`,
`pas_juge_cyber`.

## Reproduction

```bash
apps/api/node_modules/.bin/tsx scripts/couverture-dept.mts
apps/api/node_modules/.bin/tsx scripts/couverture-dept.mts --json=/tmp/couverture-vienne.json
```

Le script force la connexion au port 5433 et ne fait que des `SELECT` : aucune
écriture en base, aucun appel réseau. La sortie console contient la synthèse et
le tableau nominatif ; l'option `--json` publie les mêmes lignes avec la
synthèse calculée par SQL.
