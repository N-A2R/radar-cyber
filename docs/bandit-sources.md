# Bandit d'allocation des sources — décisions tracées et regret mesuré

> **Objectif :** 1 000 décisions enregistrées ; événements nouveaux par source
> active ≥ 2 × 8,8 % = **17,6 %** ; regret cumulé ≤ **20 %** de l'oracle
> rétrospectif. Résultat rejoué le 2026-11-23 : voir la sortie brute ci-dessous.

## Ce qui est mesuré

Une décision est l'allocation d'un lot de 100 items de collecte à **une source
active** parmi 95. Le rendement est `événements nouveaux / items lus`, agrégé
sur les 1 000 décisions. La référence de 8,8 % vient du constat historique
`apps/api/src/collectors/classify.ts` (188 événements cyber sur 2 129 dans la
famille `cti`) ; la cible est son double, 17,6 %.

L'oracle est **rétrospectif** : c'est la meilleure source du corpus gelé
(`cert-fr-alerte`, 359 nouveaux / 529 items = 67,86 %), connue seulement après
la campagne. Le regret cumulé est la somme des écarts entre ce taux et le taux
de la source effectivement choisie à chaque tour, rapportée au gain maximal
`1 000 × taux oracle`. C'est un regret **attendu** : la réalisation aléatoire
des lots est publiée séparément dans le rendement observé.

## Le corpus, sans donnée personnelle

`bench/corpus/bandit-sources-2026-11-23.json` contient uniquement des agrégats
par source : identifiant public, famille, `items_in`, `items_new`, `runs`.
Il provient de la base de développement au 2026-11-23 : `collector_run` sur
180 jours, joint à `source` (`enabled` et `statut = active`), au moins 5 runs
et 100 items lus avec au moins un événement nouveau. Les identifiants
synthétiques `bench-`, `injection-`, `test-`, `eval-`, `fixture-` sont exclus.
Ni titre d'article, ni URL, ni organisation, ni donnée personnelle, ni secret.

## La règle de décision

Thompson sampling Beta. Chaque source porte un posterior initial
`Beta(1 + 0,005 × nouveaux, 1 + 0,005 × (items − nouveaux))` : l'historique
sert d'amorçage, pas de vérité. À chaque tour, une note est tirée pour chaque
bras, le plus grand score gagne, un lot de 100 items est observé selon le
rendement vrai de la source, puis le posterior est mis à jour. La graine
`20261123` rend la campagne rejouable : mêmes tirages, mêmes décisions.

Le prior faible laisse une exploration réelle : **77 des 95 sources** reçoivent
au moins une décision. Aucune source n'est coupée, aucune source nationale
n'est présentée comme locale (les familles du corpus sont conservées telles
quelles).

## Décisions enregistrées

- Migration `db/migrate-217-bandit-decisions.sql` : `bandit_run` (paramètres et
  verdict de l'essai) et `bandit_decision` (une ligne par tirage, unicité
  `(run_id, tour)`, score échantillonné, rendement observé, oracle, regret
  cumulé, posterior). Les décisions ne sont pas réécrites.
- Trace fichier `bench/results/bandit-decisions.jsonl` : 1 000 lignes, une par
  décision, relues et comparées à la mesure avant publication.
- Rapport `bench/results/bandit-sources.json` : paramètres, métriques, verdict.
- `--db` persiste la même campagne en PostgreSQL (`bandit_run` /
  `bandit_decision`) ; le test de la migration vérifie l'idempotence et
  l'absence de doublon au rejeu.

## Rejouer

```bash
pnpm verifie:bandit-sources
wc -l bench/results/bandit-decisions.jsonl   # 1000
pnpm -F @radar/api test -- test/bandit-sources.test.ts
pnpm -F @radar/api typecheck
```

Le script ne requiert ni réseau ni base : il relit le corpus gelé, rejoue les
1 000 décisions, réécrit puis relit la trace, imprime le critère et positionne
un code de sortie non nul si un seuil échoue. Pour la persistance :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm mesure:bandit-sources -- --db
```

## Sortie brute du juge

```
corpus : 95 sources actives, fenêtre 180 j, graine 20261123
trace : bench/results/bandit-decisions.jsonl (1000 décisions relues) ; persistance non (--db absent)
décisions enregistrées : 1000 / 1000
sources actives candidates : 95 (77 explorées)
rendement des sources actives : 63,37 % / 17,60 % (2 × 8,80 %)
oracle rétrospectif : cert-fr-alerte à 67,86 %
regret cumulé : 6,59 % / 20,00 % de l'oracle (44.7049 points)
OBJECTIF : atteint — 1000 / 1000 décisions ; rendement 63,37 % / 17,60 % ; regret 6,59 % / 20,00 %
```

## Limite honnête

Le rendement vrai de chaque bras est déduit d'un historique agrégé, pas d'une
expérimentation en ligne : la mesure simule des lots binomials et non des
collectes réelles. Le regret est attendu (écart de taux), pas un manque à
gagner facturé en euros. L'évaluation porte sur 95 sources actives mesurables ;
les sources sans historique suffisant ne sont pas incluses et ne sont pas
déclarées productives.
OBJECTIF : atteint — 1000 / 1000 décisions ; rendement 63,37 % / 17,60 % ; regret 6,59 % / 20,00 %
