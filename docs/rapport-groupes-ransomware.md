# Rapport — suivi de 50 groupes ransomware et de leurs victimes de Nouvelle-Aquitaine

Date de mesure : 22 novembre 2026 (UTC). Branche : `ext/chantier-d1`.

## Chiffre mesuré

**50 groupes ransomware suivis**, avec leurs victimes de Nouvelle-Aquitaine
lorsque la preuve disponible permet de les identifier.

La commande de mesure reproductible imprime `trackedGroups: 50` :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-groupes-ransomware.mts \
  --json=bench/results/groupes-ransomware.json
```

Le résultat complet, avec la requête SQL utilisée et la liste nominative des
groupes, est enregistré dans `bench/results/groupes-ransomware.json`.

## État de départ et périmètre

L'état réel de la base utilisée pour la mesure est de **1 673 151 organisations**,
**312 sources** et **26 688 événements**. Le référentiel couvre les douze
départements de Nouvelle-Aquitaine (16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86,
87). Aucun service payant n'est utilisé ; les revendications de sites de fuite
(sources grises) sont acceptées comme indices, jamais comme incidents confirmés.

## Ce qui est suivi

Un groupe est identifié par un slug stable et un nom canonique, même lorsque
les sources écrivent « lockbit3 », « lockbit 3.0 » ou « thegentlemen ». Les
groupes retenus sont ceux qui portent des revendications dans nos données
(16 901 lignes de `quarantine_raw`) ; la sélection prend d'abord tous les
groupes ayant une victime NA étayée, puis complète jusqu'à 50 par volume de
revendications. Les 50 groupes et leurs victimes sont exposés par
`GET /api/ransomware-groups` et par l'écran anglais « Ransomware groups ».

Une victime n'est enregistrée que si l'indice de revendication ou l'événement
pointe vers une organisation du référentiel située dans un des douze
départements de la région. Quatre types de preuve sont acceptés : événement
déjà rattaché, domaine unique, nom d'organisation distinctif, corpus vérifié
de revendications NA. Le nom distinctif et le domaine doivent correspondre à
une seule organisation de Nouvelle-Aquitaine ; un nom trop générique est
rejeté. Le score de similarité du corpus vérifié doit atteindre 0,75.

## Résultat détaillé et limite assumée

Le même fichier de mesure donne :

- **50 groupes suivis** ;
- **21 groupes** ayant au moins une victime NA effectivement identifiée ;
- **36 victimes NA** (paires groupe/organisation), réparties en 21 preuves
  d'événement, 9 correspondances de nom, 4 du corpus vérifié et 2 de domaine ;
- 29 groupes suivis n'ont pas encore de victime NA confirmée dans les données
  disponibles : leur liste de victimes est vide, et elle se remplira au fil des
  prochaines collectes. Le chiffre annoncé est le nombre de groupes suivis,
  pas le nombre de groupes dont une victime a été prouvée.

Aucune donnée personnelle de victime n'est stockée ni exposée : la table de
victimes ne contient qu'un identifiant d'organisation publique, une URL de
preuve publique, la date, le type de correspondance et l'identifiant de la
revendication. Les indices bruts (adresses e-mail, numéros de téléphone,
noms de personnes) sont écartés avant correspondance et jamais persistés.
Les libellés de l'API et de l'interface sont en anglais ; le présent rapport
est en français.

## Reproduction complète

```bash
# 1. Appliquer la migration des tables de suivi
PGPASSWORD=radar psql -h localhost -p 5433 -U radar -d radar \
  -v ON_ERROR_STOP=1 -f db/migrate-052-ransomware-groups.sql

# 2. Reconstruire le suivi depuis les preuves collectées
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/track-ransomware-groups.mts

# 3. Mesurer et écrire le résultat
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-groupes-ransomware.mts \
  --json=bench/results/groupes-ransomware.json
```

Contrôles exécutés : `pnpm -F @radar/api typecheck`, `pnpm -F @radar/web typecheck`,
les 6 tests de `apps/api/test/ransomware-groups.test.ts` (un par comportement),
et le contrat des routes API (29 tests). Le fichier `apps/api/src/server.ts`
n'est pas modifié : la route est enregistrée dans le registre unique des routes.
