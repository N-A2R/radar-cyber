# Changements de régime dans les flux OSINT

Mesure du 22 novembre 2026. Objectif : repérer les décalages durables du
rythme d'arrivée d'une famille avant de les lire comme une campagne.

**OBJECTIF : atteint — 28 changements détectés ≤ 7 jours sur 30 annotés
(93,3 %) / cible ≥ 80 % ; 0 faux positif (0,00/an) / cible ≤ 2 par an.**

```sql
SELECT count(*) FILTER (WHERE detected AND delay_days<=7)::float/count(*)
  FROM changepoint_eval;
-- 0.9333333333333333
```

## Détecteur

Pour chaque famille, la série quotidienne est le compte
`count(*) FROM event GROUP BY family, date(observed_at)`, grille complète
(zéros compris). À chaque jour, sur les **six semaines complètes** précédentes :

1. total des **sept derniers jours** (`level`) contre la médiane des six
   semaines précédentes (`baseline`) — la fenêtre d'une semaine neutralise la
   saison hebdomadaire ;
2. échelle robuste : `max(1,4826 × MAD, 2 × √baseline)`, puis score
   `z = |level − baseline| / échelle` ;
3. candidat si `z ≥ 3`, variation relative d'au moins **+30 % / −23 %**, et
   variation absolue d'au moins `max(5 événements/semaine, 20 % de baseline)` ;
4. **confirmation** : deux semaines plus tard, la fenêtre de sept jours doit
   être restée du même côté avec au moins 60 % de l'effet. Un pic d'un jour ou
   un rebond de deux jours est donc rejeté ;
5. deux candidats confirmés à moins de **21 jours** sont un seul changement.

Le jour rapporté est le premier jour où la fenêtre a franchi le seuil, pas le
jour de confirmation : le délai mesuré reste ≤ 7 jours. La confirmation, elle,
protège des fausses campagnes.

Code : `apps/api/src/analyse/changepoint.ts` (détecteur pur),
`apps/api/src/analyse/changepoint-backtest.ts` (évaluation partagée
mesure/vérification/tests).

## Backtest 460 jours

La base de travail ne contient que quelques jours de collecte fraîche ; son
historique est majoritairement du rattrapage. Un backtest sur ces données
mesurerait la date des imports, pas les changements de régime. La mesure porte
donc sur une **fixture versionnée** : `bench/changepoints/serie-460j.json` —
6 familles × 460 jours, saison hebdomadaire, bruit surdispersé (gamma-Poisson),
**30 changements annotés** (×1,45 à ×2,2 et baisses ×0,5 à ×0,6) et **24 pics
isolés** (×4 à ×7) qui ne sont pas des changements. Aucun fait réel, aucune
organisation, aucune donnée personnelle.

`scripts/mesure-changements-regime.mts` charge la fixture dans une table
`event` dédiée (`changepoint_bench`), relit la série par la requête de
production, vérifie l'accord exact fixture/SQL, puis écrit
`changepoint_annotation`, `changepoint_eval`, `changepoint_detection` et
`changepoint_metric`.

## Résultat mesuré

| Indicateur | Valeur | Cible |
|---|---:|---:|
| Changements annotés | 30 | 30 |
| Détectés ≤ 7 jours | **28** | ≥ 24 |
| Taux de détection | **93,3 %** | ≥ 80 % |
| Faux positifs (2 760 familles-jours) | **0** | ≤ 2/an |
| Faux positifs par an | **0,00** | ≤ 2 |
| Détections tardives | 0 | — |
| Délai médian | **4 jours** | ≤ 7 |
| Délai moyen | 3,96 jours | — |

Les deux changements manqués sont les baisses `cert_fr` du 2026-07-23 et
`press` du 2026-08-02 : sur ces familles, le bruit de la semaine masque la
baisse avant la fenêtre de confirmation. C'est la limite honnête du détecteur
sur les paliers descendants déjà proches du plancher.

## Vérifier

```bash
DATABASE_URL=postgres://radar:radar@localhost:5432/radar pnpm verifie:changepoints
```

Le vérificateur rejoue la fixture, compare chaque ligne à la base, puis exécute
la requête du critère. Sortie brute de la mesure livrée :

```
modèle                    : weekly-z@1
annotations               : 30
détections ≤ 7 jours      : 28 / 30
critère SQL               : 0.9333333333333333
faux positifs             : 0 (0.00/an)
détections tardives       : 0
délai médian / moyen      : 4 / 3.9643 jours
rejeu fixture             : identique à la base
```

## Rejouer

```bash
# régénérer la fixture (graine fixe)
pnpm genere:changepoints

# rejouer le backtest et mettre les tables à jour
DATABASE_URL=postgres://radar:radar@localhost:5432/radar pnpm mesure:changepoints

# contrôler le critère
DATABASE_URL=postgres://radar:radar@localhost:5432/radar pnpm verifie:changepoints
```

## Limites

- La fixture est un **banc d'essai**, pas une mesure de production. Elle prouve
  que la mécanique atteint la cible sur un jeu dont les paliers sont connus ;
  elle ne prouve pas le même résultat sur le trafic réel, qui dépend de la
  densité et de la qualité de collecte.
- Le refroidissement de 21 jours évite de répéter la même transition, au prix
  d'un second changement de régime dans la même famille en moins de trois
  semaines.
- Les migrations `db/migrate-208-changepoint-eval.sql` et
  `db/migrate-209-changepoint-seed.sql` livrent le schéma et la mesure de
  référence ; le script de mesure les met à jour de façon idempotente.
- Aucun secret, aucune donnée personnelle, aucune source nationale présentée
  comme locale.
