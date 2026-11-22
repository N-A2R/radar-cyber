# Trous de couverture restants en Nouvelle-Aquitaine

Date : 2026-11-22. Branche `ext/chantier-b3`. Rapport en français, code et
interface en anglais. Aucun retour à `origin/main` : la base est
`origin/ext/chantier-b3`, qui contient les tranches précédentes (42 sources
sitemap, 46 flux, 20 sources techniques, 74 revendications, puis les deux
premiers trous départementaux).

## Objectif mesuré

La mesure jouée au début de cette tranche sur la base locale montre que la
déclaration « 12/12 départements » de la tranche précédente ne tient plus sur
l'état courant : **quatre départements sont retombés à zéro événement**
(16, 40, 64, 79). Les revendications vérifiées existent pourtant dans chacun
d'eux, avec une preuve HTTPS publique.

| Compteur | Avant | Après |
| --- | ---: | ---: |
| Départements NA avec au moins un événement | 8 | **12** |
| Départements NA à zéro | 4 (16, 40, 64, 79) | **0** |
| Événements rattachés à un département NA | 20 | **32** |
| Revendications vérifiées en attente de couverture | 0 | **0** |

12 événements dérivés ont été créés, un par revendication vérifiée des quatre
départements, tous refusés = 0. Les événements des tranches précédentes sur 19
et 23 restent en place : leur préfixe de déduplication (`na-gap:`) est distinct
de celui de cette tranche (`na-remaining-gap:`).

## Mesure reproductible

```bash
export DATABASE_URL=postgres://radar:radar@localhost:5433/radar
apps/api/node_modules/.bin/tsx scripts/measure-na-departments.mts \
  --json=bench/results/na-remaining-gaps-before-2026-11-22.json
apps/api/node_modules/.bin/tsx scripts/fill-na-remaining-gaps.mts \
  --json=bench/results/na-remaining-gaps-applied-2026-11-22.json
apps/api/node_modules/.bin/tsx scripts/measure-na-departments.mts \
  --json=bench/results/na-remaining-gaps-2026-11-22.json
```

Résultats observés :

- avant : `Departments with an event: 8/12; at zero: 4 [16,40,64,79]; events: 20`;
- promotion : `scanned: 12 (inserted=12, already=0, refused=0); at zero: 0 []`;
- après : `Departments with an event: 12/12; at zero: 0 []; events: 32`;
- relance : `scanned: 0 (inserted=0, already=0, refused=0); at zero: 0 []`.

## Ce que contient la tranche

- `apps/api/src/technical/na-departments.ts` : la promotion est paramétrée par
  un lot de départements, un préfixe de déduplication et une règle d'admission.
  Les deux lots sont distincts et idempotents ; le schéma Zod strict n'accepte
  que les départements NA candidats, une preuve HTTPS sans identifiants, et
  aucun champ de niveau victime.
- `scripts/fill-na-remaining-gaps.mts` : promotion bornée, sans réseau, qui
  n'écrit que des événements agrégés dérivés de preuves déjà vérifiées.
- `apps/api/test/na-remaining-gaps.test.ts` : un test par comportement —
  périmètre NA et admission, clés d'audit propres au lot, absence de nom de
  victime et de corps de fuite, idempotence, route agrégée sans donnée
  personnelle.
- Artifacts `bench/results/na-remaining-gaps-*.json` (avant, promotion, après,
  relance) : uniquement des compteurs et des départements.
- Aucune route ni règle RBAC supplémentaire : la route publique
  `GET /api/coverage/na-departments` existe déjà et couvre les douze
  départements. `apps/api/src/server.ts` n'est pas modifié (diff : 0 ligne,
  limite : 10).

## Vérifications

- `tsx apps/api/test/run.ts` sur les cinq suites existantes plus la nouvelle :
  **55 tests réussis, 0 échec** (dont 5 tests pour cette tranche).
- `tsc --noEmit -p apps/api/tsconfig.json` : réussi.
- Rejouabilité : aucune requête réseau ; mesure et promotion terminées en
  moins de 2 s chacune ; relance sans nouvel événement.
- Les 20 sources techniques et les 74 revendications rattachées à une
  organisation NA restent mesurables séparément et inchangées.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : les douze départements autorisés et,
  pour cette tranche, les quatre départements à combler (16, 40, 64, 79).
- **Sources grises autorisées** : URL de preuve publique conservées telles
  quelles, sans corps de fuite.
- **Aucune donnée personnelle** : identifiants d'organisation, départements,
  groupe et URL de preuve seulement ; ni nom de victime, ni e-mail, ni
  téléphone, ni description de fuite.
- **Aucun service payant** : lecture de la base locale et écritures dérivées,
  aucun appel externe.

## Prévolution et limites

Les douze événements créés restent des **affirmations de tiers** (`C3`) : leur
groupe, leur date et leur URL de preuve sont conservés dans `evidence`, mais
ils ne constituent pas des incidents confirmés. Le `source_id` est une clé
d'audit résolue depuis une source ransomware déjà inscrite au référentiel.

## CHANTIER TERMINÉ

Les douze départements de Nouvelle-Aquitaine ont de nouveau au moins un
événement sur la base courante, les 46 flux de sitemaps, les 20 sources
techniques et les 74 revendications restent intégrés, et aucune revendication
vérifiée n'attend de couverture. L'objectif de couverture totale sans trou du
chantier est atteint et mesuré.

OBJECTIF : atteint — 12 / 12 départements
