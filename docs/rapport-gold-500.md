# Jeu d'or de 500 incidents de Nouvelle-Aquitaine — rapport

Date de mesure : 22 novembre 2026. Branche : `ext/chantier-h8`.

## Objectif chiffré et résultat

L'objectif était un **corpus annoté de 500 incidents réels de Nouvelle-Aquitaine**, accompagné de sa procédure et d'une mesure reproductible.

Résultat obtenu : **500 / 500 incidents annotés**, 12 / 12 départements couverts, 0 erreur de validation, 0 donnée personnelle détectée. Empreinte SHA-256 du corpus gelé : `7f3509efa4b20b9983627245e1677ce643b614c062cd27c5144d90f28e647f9f`.

La commande `pnpm gold:measure` (hors ligne, sans base) publie ces chiffres :

```text
Gold corpus: 500/500 incidents annotated
NA departments covered: 12/12
Evidence tiers: verified=148 reported=165 claimed=187
Source kinds: official=235 press=73 grey=192
Personal-data findings: 0
Validation errors: 0
SHA-256: 7f3509efa4b20b9983627245e1677ce643b614c062cd27c5144d90f28e647f9f
```

## État réel de départ

Mesuré par la construction (`bench/gold/manifest.json`), sans jeu fictif :

| Grandeur | Valeur |
| --- | --- |
| Organisations | 1 673 151 |
| Sources | 312 |
| Événements | 26 259 |
| Candidats curatés versionnés | 292 |
| Candidats événements NA | 185 |
| Candidats revendications grises | 91 |
| Candidats à verdict humain (corpus précision gelé) | 114 |
| Candidats uniques après déduplication | 518 |

Les 500 incidents sont tirés de ces 518 candidats réels. Aucun incident n'a été inventé pour atteindre le chiffre.

## Périmètre et contraintes

- **Nouvelle-Aquitaine uniquement** : les douze codes départementaux 16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87. Le 65 en est exclu.
- **Sources grises autorisées** : revendications de groupes, index de fuites et flux Telegram sont acceptés, mais toujours étiquetés `claimed` / `grey`, jamais présentés comme des faits établis.
- **Aucune donnée personnelle de victime** : seuls les noms d'organisations du registre public, les dates et les URL publiques sont conservés. Les courriels, numéros de téléphone, identifiants et noms de personnes explicites sont supprimés par `redactPersonalData` ; les noms d'organisations qui ressemblent à une personne physique sont écartés des revendications.
- **Aucun service payant** : lecture du dépôt et de PostgreSQL local uniquement ; aucun appel réseau, aucune clé API.
- **Code et interface en anglais**, rapport en français.
- **`apps/api/src/server.ts` n'est pas modifié** (diff de 0 ligne).

## Procédure d'annotation (procédure `gold-corpus-v1`)

1. **Population.** Quatre viviers réels : corpus curatés versionnés (`bench/corpus/incidents-*.jsonl`, `bench/couverture/incidents.jsonl`, `bench/corpus/ransomware-na.jsonl`, `bench/fixtures/corpus-reference-na.json`, `bench/fixtures/corpus-temoin-na.json`), événements de la base (source à portée NA, signal `regional` ou organisation rattachée à un département NA), revendications `quarantine_raw` dont le nom correspond exactement à une organisation NA du registre, et affaires du corpus de précision gelé ayant reçu un verdict humain exploitable (`exacte`, `partielle`, `indecidable`).
2. **Inclusion.** Une ligne doit avoir un département NA, une URL de preuve `http(s)`, une date observable et une organisation publique. Les CVE et les simples bulletins de vulnérabilité (`family = vuln`) sont exclus : ce ne sont pas des incidents.
3. **Niveaux de preuve.** `verified` : incident curaté avec extrait et date vérifiés ; `reported` : événement observé par une source NA ou rattaché à une organisation NA ; `claimed` : revendication ou correspondance d'identité, non confirmée de façon indépendante.
4. **Déduplication.** Une URL normalisée (schéma, `www.`, slash final) désigne un seul incident ; en cas de doublon, l'ordre curaté → événement est prioritaire. Les revendications partageant la même URL de flux sont distinguées par leur identifiant source.
5. **Annotation.** Chaque incident reçoit un type parmi sept (`ransomware`, `data_leak`, `phishing`, `intrusion`, `service_disruption`, `fraud`, `other`), une règle d'annotation horodatée, un niveau de confiance et une note. Les niveaux et les règles sont fermés : une valeur inconnue fait échouer la validation.
6. **Tirage déterministe.** Graine `20261122`, quotas indicatifs 30 % / 50 % / 20 % par niveau, répartition du reste par plus grand résidu et report des déficits vers les viviers disponibles, ordre aléatoire propre à chaque niveau, puis tri par clé et attribution d'identifiants stables `gold-na-00001` … `gold-na-00500`. Le même seed et la même population redonnent le même fichier.
7. **Contrôle et gel.** Le corpus est validé (périmètre NA, URL, champs obligatoires, absence de données personnelles), puis figé dans `bench/gold/incidents-na-500.jsonl` avec `bench/gold/manifest.json` qui consigne la population, les quotas obtenus et l'empreinte SHA-256.

## Commandes reproductibles

```bash
export DATABASE_URL=postgres://radar:radar@localhost:5433/radar   # base locale existante
pnpm gold:build                                                  # reconstruit le corpus gelé
pnpm gold:measure                                                # mesure hors ligne, affiche 500/500
cd apps/api && ./node_modules/.bin/tsx test/run.ts test/gold-corpus.test.ts
```

La mesure ne dépend pas de l'état de la base : elle relit le fichier gelé. La reconstruction dépend, elle, de la base réelle ; le manifeste enregistre les effectifs du jour.

## Résultats détaillés

| Niveau de preuve | Nombre |
| --- | ---: |
| `verified` | 148 |
| `reported` | 165 |
| `claimed` | 187 |

| Famille de source | Nombre |
| --- | ---: |
| `official` | 235 |
| `press` | 73 |
| `grey` | 192 |

| Type d'incident | Nombre |
| --- | ---: |
| ransomware | 217 |
| intrusion | 166 |
| data_leak | 60 |
| other | 30 |
| phishing | 20 |
| service_disruption | 4 |
| fraud | 3 |

Les douze départements sont représentés ; les effectifs par département figurent dans le manifeste et peuvent être recomputés depuis le fichier gelé.

## Limites assumées

- Le niveau `claimed` ne prouve pas l'incident : il atteste d'une revendication publique ou d'une correspondance exacte de nom avec une organisation NA. C'est le prix de l'effectif 500 sans service payant ; cette limite est écrite dans chaque annotation.
- Les noms d'organisations proviennent du registre public versionné. Aucune victime physique, aucun contact et aucun extrait brut de revendication ne figurent dans le corpus.
- La mesure porte sur le corpus gelé, pas sur la qualité intrinsèque de chaque article source : lesdites sources restent traçables par `sourceRef` et `sourceUrl`.

## Fichiers livrés

- `apps/api/src/gold/corpus.ts` — règles pures d'annotation, validation, tirage et mesure.
- `apps/api/src/gold/sources.ts` — lecteurs des viviers réels (fichiers versionnés et base).
- `scripts/gold-build.mts`, `scripts/gold-measure.mts` — interface en ligne de commande.
- `bench/gold/incidents-na-500.jsonl`, `bench/gold/manifest.json` — corpus gelé et sa fiche de traçabilité.
- `apps/api/test/gold-corpus.test.ts` — un test par comportement (14 tests).
- `package.json` — commandes `gold:build` et `gold:measure`.
