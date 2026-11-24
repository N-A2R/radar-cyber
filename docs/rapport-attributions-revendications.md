# Rapport — attribution des revendications (groupe et confiance contestables)

Date de mesure : 24 novembre 2026 (UTC). Branche : `ext/ch-063-veil-10`.

OBJECTIF : atteint — 35170 / 50

Le critère est le nombre de lignes de `attribution` portant un code Admiralty
valide (`^[A-F][1-6]$`) ; la cible était d'au moins 50.

## Preuves observées

| Contrôle | Valeur mesurée | Attendu |
|---|---:|---:|
| Lignes avec code Admiralty valide | 35 170 | ≥ 50 |
| Attributions réelles (groupe reconnu et preuve citée) | 19 784 | ≥ 50 |
| Lignes dans `attribution_audit` | 35 171 | > 0 |
| Contestations enregistrées (`operation = 'UPDATE'`) | 1 | ≥ 1 |
| Revendications sans preuve http(s) | 9 802 | — |
| Revendications sans preuve restées `non attribué` / `F6` | 9 802 / 9 802 | toutes |
| Lignes non attribuées, tout motif confondu | 15 386 | — |

Les 35 170 lignes conformes incluent les attributions non résolues, codées
`F6` (« inconnu » de l'échelle Admiralty) : ce ne sont pas 35 170 attributions
à un groupe. Le compte réel, groupe du catalogue public reconnu et preuve
citée, est de **19 784**, lui aussi très au-dessus de la cible.

## Refus sans preuve

Un contrôle en lecture seule sur la base réelle confirme que les revendications
sans `evidence_url` (par exemple les identifiants 12, 14 et 15) restent
`non attribué` / `F6`. Le trigger `attribution_exige_preuve` de la migration
217 refuse toute modification qui tenterait de leur donner un groupe ou une
preuve, avec `ERRCODE = '23514'` (violation de contrainte). La tentative
d'écriture susceptible de prouver ce refus est documentée dans
`docs/attribution-revendications-confiance.md` ; elle n'a pas été rejouée ici,
la base partagée ne devant pas être modifiée pendant les audits concurrents.

## Reproduction et périmètre

La mesure complète est reproductible avec `pnpm migrate`,
`pnpm attributions:backfill` (idempotent), une contestation via
`contester_attribution`, puis `pnpm verifie:attributions`. Le vérificateur
imprime le compte Admiralty, le nombre d'attributions réelles, l'état d'une
revendication sans preuve, le refus SQLSTATE 23514 et le nombre de lignes
d'audit. Son détail est consigné dans
`docs/attribution-revendications-confiance.md`.

Le remplissage ne recopie jamais le libellé libre d'un groupe inconnu et ne lit
aucune victime : seuls le groupe du catalogue public `leak_site`, la preuve et
la source servent au calcul. Les routes `/api/attributions*`, le journal
d'audit et ce rapport n'exposent aucune donnée personnelle ; la contestation
est réservée au rôle applicatif `analyste`.
