# Rapport — attribution acteur vers groupe

Date de mesure : 22 novembre 2026 (UTC). Branche : `ext/chantier-e8`.

## Chiffre mesuré

**21 attributions acteur → groupe, toutes avec leur confiance** (21 de niveau
`high`, aucune de niveau `medium` ou `low`), soit une confiance moyenne de
**97,1 / 100**.

La commande reproductible imprime `attributions: 21` :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-attributions-acteur-groupe.mts \
  --json=bench/results/attributions-acteur-groupe.json
```

Le détail complet (21 lignes acteur / groupe / confiance / méthode / sources /
revendications, les requêtes SQL et les répartitions) est enregistré dans
`bench/results/attributions-acteur-groupe.json`.

## État de départ et périmètre

La base réelle utilisée contient **1 673 151 organisations**, **312 sources** et
**26 394 événements**. Le périmètre est limité à la Nouvelle-Aquitaine : seuls
les 21 groupes suivis ayant au moins une victime dans l'un des douze
départements de la région (16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87)
peuvent recevoir une attribution. Les libellés d'acteurs proviennent des
revendications de quarantaine et des événements ransomware déjà collectés ;
les sources grises sont acceptées comme indices et jamais comme incidents
confirmés. Aucun service payant n'est appelé.
**206 libellés d'acteurs distincts** ont été agrégés ; 21 ont été attribués,
185 n'ont pas été attribués faute de preuve suffisante. Un libellé non attribué
n'est pas une donnée perdue : il reste dans les sources, il n'est simplement pas
présenté comme une attribution fiable.

## Méthode

Quatre règles déterministes, appliquées dans cet ordre, produisent une
confidence explicite :

| Méthode | Règle | Score de base | Résultat mesuré |
|---|---|---:|---:|
| `exact` | clé normalisée égale au slug ou au nom du groupe | 95 | 20 |
| `alias` | variante de numérotation connue (`lockbit3` → LockBit 3.0) | 90 | 1 |
| `prefix` | préfixe unique, au moins 5 caractères | 72 | 0 |
| `fuzzy` | une seule faute de frappe, au moins 7 caractères | 62 | 0 |

La normalisation retire la casse, les accents, la ponctuation et les suffixes
génériques (« Ransomware », « Group », « Leaks »). Une correspondance n'est
acceptée que si le candidat est unique : deux groupes partageant la même clé
sont ambigus et aucun n'est revendiqué. Une faute de frappe suffit ; deux
fautes sont rejetées, car elles rapprocheraient des groupes distincts. Le score
est majoré de 3 points pour deux sources indépendantes et de 5 pour trois ou
plus, sans jamais dépasser 100. Le volume de revendications ne modifie pas le
score : il ne prouve pas l'identité de l'acteur.

Les niveaux sont `high` à partir de 90, `medium` à partir de 75, `low` en
dessous. Ici, 20 correspondances exactes et un alias donnent 21 attributions
`high`.

## Données personnelles

La table `actor_group_attribution` ne contient qu'un libellé d'acteur public,
une clé normalisée, un nom de groupe public, le score, la méthode, le nombre de
sources et le nombre de revendications. Aucun indice brut, nom de victime,
adresse e-mail ou numéro de téléphone n'est stocké ni exposé. Les libellés
ressemblant à une personne sont rejetés avant attribution. La route publique
`GET /api/actor-attributions` et l'écran anglais « Attributions » n'exposent
que ces champs.

## Reproduction complète

```bash
# 1. Table de mesure (idempotente)
PGPASSWORD=radar psql -h localhost -p 5433 -U radar -d radar \
  -v ON_ERROR_STOP=1 -f db/migrate-064-actor-attributions.sql

# 2. Reconstruire les attributions depuis les preuves collectées
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/rebuild-actor-attributions.mts

# 3. Mesurer et écrire le résultat (commande du chiffre annoncé)
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-attributions-acteur-groupe.mts \
  --json=bench/results/attributions-acteur-groupe.json
```

L'étape 2 exige les tables de suivi des groupes (`db/migrate-052-ransomware-groups.sql`),
déjà présentes dans la base réelle. Le script le vérifie et s'arrête avec un
message explicite si elles manquent.

## Contrôles exécutés

- 9 tests unitaires, un par comportement :
  `apps/api/node_modules/.bin/tsx --test apps/api/test/actor-group-attribution.test.ts`
  (9 passent) ;
- contrôle d'accès des routes : 3 tests passent, la nouvelle route publique est
  couverte par `POLITIQUE_ACCES` ;
- typecheck API : OK ;
- route HTTP réelle sur un serveur temporaire : `total: 21`, `high: 21`,
  `averageConfidence: 97.1` ;
- validation syntaxique des fichiers TypeScript/TSX ajoutés et de `App.tsx` :
  OK. Le typecheck web complet n'a pas pu être exécuté dans ce worktree, le
  lien `node_modules` n'y fournit pas les dépendances front-end.

`apps/api/src/server.ts` n'est pas modifié : la route est enregistrée dans le
registre unique des routes. L'interface est en anglais ; le présent rapport est
en français.

## Corbeille assumée

Une première version autorisait deux différences en correspondance approchée.
Elle attribuait à tort `lockbit3_fs` (groupe distinct non suivi en NA) à
LockBit 3.0, avec une confiance faible de 65. La règle a été resserrée à une
seule différence, avec un test de non-régression dédié ; la mesure est passée
de 22 à **21 attributions**, toutes désormais `high`.
