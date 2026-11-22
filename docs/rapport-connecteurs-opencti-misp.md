# Connecteurs OpenCTI et MISP — chantier G3

Date : 2026-11-22. Branche `ext/chantier-g3`. Rapport en français ; code, tests et sorties machine en anglais.

## Réponse chiffrée

**Export et import testés sur 104 événements réels de Nouvelle-Aquitaine : 104 exportés vers un bundle OpenCTI (STIX 2.1) puis 104 réimportés depuis un flux MISP équivalent, soit 104/104 — 100 % de correspondance.**

La commande de mesure reproductible produit `exportAndImportTested: 104`,
`coveragePercent: 100`, `passed: true`. Aucun événement de la région n'a été
perdu, aucun événement extérieur n'a été admis, aucune donnée personnelle de
victime n'a quitté le processus.

## Prévol

- `gh pr list --state all --search 'OpenCTI MISP'` (et les recherches séparées
  `MISP`, `OpenCTI`, `connecteur`) : aucune PR.
- `git log --oneline --all | grep -i -E 'opencti|misp|connecteur|connector'` :
  aucun commit de connecteur. Les quatre occurrences de « MISP » dans
  l'historique concernent des corrections de corpus, pas ce chantier.

Il n'y avait donc rien à reprendre : l'implémentation a été faite à partir de
l'état réel de la branche.

## État réel de départ

Mesuré en lecture seule par la commande ci-dessous, au moment de la mesure :

| Grandeur | Valeur mesurée |
|---|---:|
| Organisations | 1 673 151 |
| Sources | 312 |
| Événements | 26 230 |
| Événements Nouvelle-Aquitaine retenus | 104 |
| Sources grey associées à ces événements | 100 |

Les 104 événements sont sélectionnés par `e.regional = true` **ou** rattachement
à une organisation dont le département est l'un des douze codes de
Nouvelle-Aquitaine. Sur ces 104 événements, 72 portent le drapeau régional, 31
n'ont pas de département d'organisation (régionaux par le texte) et 22 ont un
département d'organisation hors région mais un indice territorial explicite.
Le périmètre est donc vérifié, jamais déduit d'une nationalité ou d'un nom.

Le chiffre annoncé de « ~28 000 événements » correspond aux mesures historiques
du dépôt ; la base courante en contient 26 230. C'est ce chiffre mesuré, et non
le chiffre de cadrage, qui est publié ici.

## Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `apps/api/src/connectors/privacy.ts` | Scrubber partagé : e-mails, téléphones, IBAN, identifiants nationaux, civilités nominatives, et URL sans identifiants/requête/fragment. |
| `apps/api/src/connectors/opencti.ts` | Export : projection allow-list vers un bundle STIX 2.1 (identité, localisation, un `report` par événement), identifiants déterministes, étiquettes de département et de confiance de source. |
| `apps/api/src/connectors/misp.ts` | Import : lecture des enveloppes MISP (`Event`, tableau, `response.Event`), filtrage territorial par tag explicite, allow-list d'attributs, dédup par UUID. |
| `scripts/measure-connectors.mts` | Mesure reproductible sur la base réelle, en lecture seule, avec sortie JSON et fichier de résultat optionnel. |
| `bench/results/connectors-opencti-misp.json` | Résultat de la mesure publiée. |
| `apps/api/test/*.test.ts` | 12 tests, un comportement par test. |

Aucun service externe n'est contacté : les deux connecteurs sont des modules
TypeScript purs, le bundle et les événements MISP sont des objets JSON. Aucune
dépendance payante ni nouveau service n'a été introduit.

## Commande reproductible et résultat

Avec `DATABASE_URL` pointant vers la base de travail (variable d'environnement,
aucun mot de passe écrit dans le dépôt) :

```bash
DATABASE_URL="$DATABASE_URL" apps/api/node_modules/.bin/tsx \
  scripts/measure-connectors.mts --out=bench/results/connectors-opencti-misp.json
```

Équivalent dans un checkout où `pnpm` peut écrire son répertoire d'état :
`DATABASE_URL="$DATABASE_URL" pnpm measure:connectors`.

Sortie exacte de la mesure publiée (durée : 399 ms) :

```json
{
  "state": { "organizations": 1673151, "sources": 312, "events": 26230 },
  "export": {
    "naEvents": 104,
    "exported": 104,
    "stixObjects": 106,
    "graySources": 100,
    "skippedOutsideRegion": 0,
    "personalDataLeaks": 0
  },
  "import": {
    "mispEvents": 104,
    "accepted": 104,
    "rejected": 0,
    "personalAttributesDropped": 105,
    "roundTripMatched": 104
  },
  "objective": {
    "exportAndImportTested": 104,
    "coveragePercent": 100,
    "passed": true
  },
  "durationMs": 399
}
```

Les 105 attributs rejetés se décomposent en **104 sondes e-mail délibérément
injectées** dans les flux MISP de test (une par événement, toutes rejetées) et
**une URL de 513 caractères** refusée par la limite de 512 caractères du
connecteur. Ce dernier rejet est conservateur et documenté : aucune donnée
personnelle n'était en cause.

## Tests — un comportement par test

```bash
apps/api/node_modules/.bin/tsx --test --test-concurrency=1 \
  apps/api/test/opencti-export.test.ts \
  apps/api/test/misp-import.test.ts \
  apps/api/test/cti-connectors-roundtrip.test.ts
```

Résultat : **12 tests, 12 réussis, 0 échec** (546 ms). La suite officielle avec
base jetable (`test/run.ts`, trois fichiers ci-dessus) donne le même résultat :
12/12 en 1,16 s. Le typage (`tsc --noEmit`) passe en 7,08 s.

Comportements couverts :

- export : filtrage territorial, événement régional sans organisation, sources
  grises étiquetées, absence de données personnelles/résumés/preuves/coordonnées,
  identifiants STIX déterministes ;
- import : attributs autorisés, rejet sans tag de région, suppression des
  identifiants personnels et des requêtes d'URL, maintien des sources grises,
  dédup par UUID, payloads malformés ;
- aller-retour : les 104 identifiants exportés sont retrouvés à l'import, avec
  zéro rejet et zéro sonde e-mail conservée.

## Contraintes

| Contrainte | Vérification |
|---|---|
| Nouvelle-Aquitaine uniquement | 104 événements filtrés par drapeau régional ou département NA ; aucun événement hors région dans le bundle ni à l'import. |
| Sources grises autorisées | 100 événements de sources `relevance = 'context'` exportés avec l'étiquette `source-trust:gray`, puis acceptés à l'import avec le même marqueur. |
| Aucune donnée personnelle de victime | `personalDataLeaks: 0` sur le bundle ; champs libres, preuves et coordonnées absents de l'allow-list ; 104 sondes e-mail rejetées à l'import. |
| Aucun service payant | Modules locaux, aucun appel HTTP, aucune clé, aucune dépendance ajoutée. |
| Code et interface en anglais | Identifiants, commentaires, noms de tests et clés JSON de sortie en anglais ; seule cette mesure est en français. |
| Diff de `server.ts` ≤ 10 lignes | **0 ligne modifiée** (`git diff -- apps/api/src/server.ts` vide) : aucun nouveau routeur, aucun cron ajouté. |
| Aucune commande > 60 s | Mesure 0,40 s ; tests 0,55 s / 1,16 s ; typage 7,08 s. |

Note d'environnement : dans ce worktree, `node_modules` est un lien symbolique
et `pnpm` refuse d'utiliser son répertoire d'état (`ERR_PNPM_UNSAFE_TASK_RUN_STATE_PATH`).
Les vérifications ont donc été lancées avec les binaires locaux `tsx` et `tsc`,
sans modifier ce lien.
