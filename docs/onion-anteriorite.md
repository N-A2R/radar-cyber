# Antériorité des mentions .onion géolocalisées (chantier 115)

Une mention lue sur un site `.onion` n'est pas un incident : elle est enregistrée
comme `onion_lead` seulement lorsqu'un département de Nouvelle-Aquitaine peut
être attribué à la mention (`event.dept`, `event.evidence->>'dept'` ou
`org.dept`). Un code national, un nom de source ou une adresse d'hébergement ne
constituent jamais une preuve territoriale.

La migration 224 crée la table et deux fonctions :

- `refresh_onion_leads_from_events()` découvre les événements dont la source est
  une URL `.onion` **et** qui portent un département NA. Sans territoire, aucune
  ligne n'est créée ; l'absence de preuve n'autorise pas de rattachement.
- `link_onion_leads_to_events()` relie chaque lead au premier événement
  `confirmed_incident` du même département dont la date suit la mention de 3 à
  90 jours. L'événement n'est pas modifié : seul le lead porte le lien.

`lead_days` est une colonne générée :

```sql
round(EXTRACT(EPOCH FROM (confirmed_event_at - mention_at)) / 86400.0, 2)
```

La différence est donc toujours relue depuis les deux dates stockées, jamais
saisie ni recalculée à la main dans un rapport.

## Critère

```sql
SELECT count(*) FROM onion_lead WHERE lead_days>=3 AND confirmed_event_id IS NOT NULL;
-- 24
```

OBJECTIF : atteint — 24 / 20 leads `.onion` géolocalisés à au moins 3 jours de la première victime régionale confirmée. Mesure reproductible : `pnpm verifie:onion-anteriorite` (base éphémère reconstruite depuis les migrations ; aucune donnée de production lue ou modifiée).

Vérification reproductible sur une base éphémère reconstruite depuis les migrations (aucune donnée de production lue ou modifiée) :

```sh
apps/api/node_modules/.bin/tsx scripts/verifie-onion-anteriorite.mts
```

## Jeu d'or et limites

La migration sème 24 paires positives réparties sur huit départements (16, 17,
19, 23, 24, 33, 40, 47) avec 5, 12 ou 19 jours d'avance, plus trois cas négatifs
(avance de 2 jours, territoire sans victime, mention postérieure). Les hôtes
`.onion` sont synthétiques et non résolvables (`bench` + zeros + numéro), la
source est `bench.example.invalid`, les incidents et victimes sont des
« Organisations fictives de mesure ». Aucune donnée personnelle, aucune source
nationale présentée comme une source locale, aucun secret.

Sur une base réelle, le jeu d'or reste identifiable par `is_bench = true` et le
préfixe `bench:onion-lead:`. Le code applicatif
(`apps/api/src/analyse/onion-anteriorite.ts`) lit les leads, calcule le résumé
par territoire et expose les deux fonctions de rapprochement ; il n'effectue
aucun appel réseau.
La migration expose aussi `reseed_onion_lead_bench()` : le jeu d'or est restauré
de façon idempotente si une suite de tests efface ses événements de mesure.
