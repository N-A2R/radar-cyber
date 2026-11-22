# Rapport — Secrets fuités sur GitHub

**Date de mesure :** 22 novembre 2026.
**Périmètre :** Nouvelle-Aquitaine uniquement. Sources grises admises, aucun service payant.

## Résultat

**Le nombre de secrets (clés, jetons) trouvés dans les dépôts publics d'organisations de Nouvelle-Aquitaine est 9**, sur le corpus mesuré. Aucun secret n'a été publié : le nombre 9 est le seul résultat exposé.

| Type de secret | Nombre |
|---|---:|
| Jeton GitHub (`github_token`) | 5 |
| Identifiant de service dans un fichier d'environnement (`env_credential`) | 2 |
| Clé d'API générique (`generic_api_key`) | 2 |
| **Total (empreintes distinctes)** | **9** |

Trois organisations sur les 30 examinées portent ces 9 findings. Les identifiants publics de ces organisations et les types de secrets figurent dans le résultat committable `bench/results/github-secrets-2026-11-22.json`.

## État réel de départ

La mesure est établie sur l'état réel fourni, pas sur un jeu de démonstration. Le référentiel de départ est celui publié dans `docs/rapport-fuites-domaine.md` (base `postgres://radar:radar@localhost:5433/radar`) :

| Grandeur | Valeur de départ |
|---|---:|
| Organisations | 1 673 151 |
| Sources | 312 |
| Événements | 26 688 |

L'inventaire GitHub est construit à partir de ce périmètre : 30 organisations dont le profil GitHub public indique une localisation en Nouvelle-Aquitaine, 62 dépôts publics et 303 fichiers analysés.

## Méthode

1. Recherche d'organisations GitHub par localisation publique (`Bordeaux`, `Poitiers`, `Limoges`, `La Rochelle`, `Nouvelle-Aquitaine`, …), puis confirmation sur le profil. Le filtre `isNaLocation()` n'accepte que les douze départements, les préfectures et la région.
2. Deux passes de lecture : fichiers de configuration candidats de chaque dépôt public, puis recherche de code GitHub ciblée sur les préfixes à forte valeur (`AKIA`, `client_secret`), limitée aux mêmes organisations.
3. Détection de huit formes d'identifiants (jetons GitHub, clés AWS, jetons Slack, clés Google, clés privées, identifiants d'environnement, clés génériques) avec exclusion des valeurs de documentation (`EXAMPLE`, `xxxx`, `your_…`).
4. Chaque valeur trouvée est remplacée par une empreinte SHA-256 tronquée à 16 hexadécimaux. Le fichier `db/data/github-na-secrets.json` ne contient que des identifiants publics, des chemins de fichiers, des numéros de ligne, des types et des empreintes. Aucun corps de fichier, jeton, courriel ou nom de victime n'est écrit sur le disque, journalisé ou transmis par l'API.

Aucun appel à un service payant : l'API publique GitHub via `gh` et la version locale du corpus suffisent. Aucune donnée personnelle de victime n'est lue : seules des organisations publiques et leur code public sont examinés.

## Commande reproductible

```bash
pnpm measure:github-secrets
# ou, pour écrire un résultat daté :
pnpm measure:github-secrets --json=bench/results/github-secrets-2026-11-22.json
```

Sortie observée :

```
NA GitHub secrets: 9 (orgs=30, repos=62, files=303, baseline orgs=1673151, sources=312, events=26688) -> bench/results/github-secrets-2026-11-22.json
```

La commande est hors ligne et déterministe : elle relit le corpus vérifié, recalcule les empreintes distinctes et refuse d'écrire un résultat qui contiendrait une chaîne ressemblant à un secret.

La collecte en ligne, distincte de la mesure, se fait avec `pnpm collect:github-secrets` (47 s mesurées, sous la limite de 60 s). Elle réécrit le corpus en n'y laissant que des métadonnées.

## Vérifications

- `tsx test/run.ts test/securite-couverture.test.ts` : **3 tests réussis, 0 échec** — la nouvelle route `/api/github-secrets` possède bien sa règle d'accès.
- `tsx --test apps/api/test/github-secrets.test.ts` : **11 tests réussis, 0 échec** — un test par comportement (détection sans valeur, exclusions de documentation, déduplication, filtre NA positif et négatif, refus d'un corpus portant une valeur brute, refus d'une localisation hors NA, agrégation par type et organisation, absence de secret dans le JSON sérialisé, identifiants d'environnement, route limitée aux compteurs).
- `apps/api/src/server.ts` n'est **pas modifié** (diff de 0 ligne) : la route est enregistrée dans `routes/index.ts` et autorisée dans `security/rbac.ts`.
- Le code, les clés JSON, la route et les messages sont en anglais ; le présent rapport est en français.

## Limites mesurées

Le chiffre 9 vaut pour l'échantillon réellement parcouru (30 organisations NA, 62 dépôts, 303 fichiers), pas pour l'intégralité de GitHub. Les dépôts dont le commit par défaut n'est pas résolvable et les fichiers absents de la recherche de code ne sont pas comptés. Les valeurs de documentation sont volontairement écartées : le compteur est donc conservative, il ne gonfle pas les faux positifs.

## Prévolution

`gh pr list --state all --search 'secret'`, `'GitHub'`, `'jetons'`, `'secrets fuites'` et `git log --all | grep -i secret` ne montrent aucune PR ni aucun commit portant sur les secrets GitHub. Le travail des tranches précédentes (fuites par domaine, sites de fuite, index .onion) est conservé : la branche `ext/chantier-n5` part de l'état réel de `origin/main`, sans reset ni retour en arrière.

OBJECTIF : atteint — 9 secrets détectés, 0 publiés / 9 secrets du corpus mesuré, 0 publiés
