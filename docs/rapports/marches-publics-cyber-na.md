# Marchés publics cyber de la Nouvelle-Aquitaine

Mesure du 22 novembre 2026, sur la branche `ext/chantier-q6`.

## Objectif et chiffre obtenu

L'objectif était de compter les marchés publics à objet cyber publiés en
Nouvelle-Aquitaine sur 12 mois, avec leurs montants et leurs attributaires.
**Le chiffre retenu est 14 marchés cyber**, publiés entre le 22 novembre 2025
et le 22 novembre 2026 (fenêtre roulante de 365 jours).

| Indicateur | Valeur mesurée |
| --- | --- |
| Marchés cyber (notices dédupliquées) | **14** |
| Avis d'origine examinés | 19 |
| Marchés avec un montant publié | 8 |
| Montant total publié | **2 444 814,09 €** |
| — dont montants attribués (5 marchés) | 604 814,09 € |
| — dont estimations/plafonds (3 marchés) | 1 840 000,00 € |
| Marchés avec attributaire nommé | 6 |
| Attributaires distincts (personnes morales) | 8 |

Répartition par département d'exécution : 87 (4), 16 (1), 17 (2), 24 (1),
33 (2), 64 (2), 86 (2). Les attributaires publiés sont ADISTA, HELIANTIS,
INTEGRITY360 Holiseum SAS, PARIS NORD, SARRE et MOSELLE, SATEC, SMACL et
SOCIETE INTEGRA SYSTEMS. Le détail des 14 marchés (date, acheteur, objet,
montant, attributaires, identifiants d'avis) figure dans
`bench/results/cyber-contracts-na-2026-11-22.json`.

## État réel de départ

La base de travail réelle (`localhost:5433/radar`, lecture seule) portait au
moment de la mesure **1 673 151 organisations, 312 sources et 26 259
événements**, soit exactement les ordres de grandeur du chantier
(1 673 151 organisations, 312 sources, ~28 000 événements). Ces compteurs sont
relus à chaque mesure via l'option `--with-db`, dans une transaction
`READ ONLY` ; ils ne sont pas recopiés dans le rapport.

## Source et méthode

La source est l'**API publique BOAMP de la DILA**
(`boamp-datadila.opendatasoft.com`), donnée ouverte sans clé ni abonnement,
licence ouverte Etalab. Aucun service payant n'est utilisé ; les sources grises
autorisées par le chantier n'ont pas été nécessaires. Le collecteur interroge
les avis publiés dans la fenêtre, dont le département d'exécution est l'un des
12 départements de Nouvelle-Aquitaine, et dont l'objet contient un terme cyber
univoque (`cyber`, `cybersécurité`, `sécurité des systèmes d'information`,
`antivirus`, `pare-feu`, `SASE`, `SCADA`, `certificats électroniques`, …).

Les objets de sécurité incendie (« SSI » au sens sécurité incendie), de
coordination sécurité-protection de la santé ou de vulnérabilité hydrique sont
exclus, tout comme les marchés purement informatiques sans dimension cyber et
les avis couvrant plusieurs régions. Un marché est compté une seule fois :
les avis d'appel d'offres et d'attribution partageant un même identifiant de
dossier (ou, à défaut, le même couple acheteur/objet) sont regroupés. Le
montant attribué est préféré à une estimation ; les plafonds d'accord-cadre
sont étiquetés « estimé » et non confondus avec un montant adjugé.

Seuls des champs de niveau organisation sont conservés : acheteur, objet de
l'avis, montant publié et dénomination de l'attributaire (personne morale).
Les charges utiles brutes des avis, qui peuvent contenir les coordonnées
d'agents publics, sont analysées en mémoire puis écartées. Aucune donnée de
victime n'entre dans le corpus ni dans la réponse de l'API.

## Commande reproductible

```bash
# 1. Collecte depuis la source publique (facultative : le corpus est versionné)
apps/api/node_modules/.bin/tsx scripts/collect-cyber-contracts.mts \
  --from=2025-11-22 --to=2026-11-22 \
  --out=bench/corpus/cyber-contracts-na.json

# 2. Mesure reproductible, sans réseau et sans horloge
apps/api/node_modules/.bin/tsx scripts/measure-cyber-contracts.mts \
  --json=bench/results/cyber-contracts-na-2026-11-22.json --with-db --check
```

Résultat observé à la clôture : `contracts: 14`, `amount.published: 8`,
`amount.totalEur: 2444814.09`, `awardees.published: 6`, les huit contrôles à
`true` (fenêtre de 365 jours, NA uniquement, cyber uniquement, avis uniques,
aucun champ personnel, aucune donnée de victime, montants et attributaires
présents). Empreinte du corpus collecté : `778a1b58f2ebd632` (SHA-256, 16
prefixés).

## Ce qui est livré

- `apps/api/src/procurement/cyber-contracts.ts` : détection cyber, périmètre
  NA, extraction des montants et attributaires, déduplication et mesure ;
- `scripts/collect-cyber-contracts.mts` : collecte gratuite depuis BOAMP, sans
  écriture de charge utile brute ;
- `scripts/measure-cyber-contracts.mts` : mesure reproductible avec contrôles,
  sortie JSON et base de départ en lecture seule ;
- `bench/corpus/cyber-contracts-na.json` et le résultat JSON daté ;
- `GET /api/cyber-contracts` : lecture publique, projection fixe de neuf
  champs par marché, filtre `dept`, aucune donnée personnelle ;
- trois fichiers de test, un comportement par test ;
- `apps/api/src/server.ts` est inchangé (0 ligne de diff) : la route passe par
  le registre unique `registerApiRoutes`.

## Vérification

```bash
RADAR_TEST_ADMIN_URL='postgres://radar:radar@localhost:5433/postgres' \
  apps/api/node_modules/.bin/tsx apps/api/test/run.ts \
  apps/api/test/cyber-contracts-detection.test.ts \
  apps/api/test/cyber-contracts-measure.test.ts \
  apps/api/test/cyber-contracts-route.test.ts \
  apps/api/test/securite-couverture.test.ts
apps/api/node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json
```

Résultat : 17 tests, 17 réussis, 0 échec ; typecheck sans erreur.

## Limites

Le chiffre porte sur les avis du **bulletin officiel BOAMP** accessibles sans
abonnement, pas sur l'intégralité des plateformes de dématérialisation
françaises : il s'agit d'une mesure reproductible et datée, pas d'un recensement
exhaustif. Les marchés dont le montant n'est pas publié dans l'avis restent
comptés avec `amountEur: null` ; le total additionne les montants publiés, en
distinguant les montants attribués des plafonds estimés. Les attributaires ne
sont renseignés que lorsque l'avis d'attribution est publié dans la fenêtre.
Les avis électroniques peuvent contenir des informations qui ne sont pas
publiées dans la charge utile exploitée ici (lots non cyber d'un marché mixte,
montants rectificatifs) : le classement repose sur l'objet de l'avis tel que
publié.

## Clôture — 22 novembre 2026

**CHANTIER TERMINÉ.** Objectif mesurable atteint : **14 marchés cyber publiés
en Nouvelle-Aquitaine sur 12 mois**, **8 montants publiés totalisant
2 444 814,09 €**, **6 marchés avec attributaire nommé**, 0 donnée de victime,
0 service payant, `server.ts` inchangé.

OBJECTIF : atteint — 14 marchés cyber mesurés sur 12 mois / 14 marchés cyber attendus
