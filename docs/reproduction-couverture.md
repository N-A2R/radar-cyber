# Reproduction du chiffre de couverture — mode opératoire

Document/autorisation : ce mode opératoire s'exécute **uniquement dans le
worktree `/data/home/loop/wt-couv-reproduction`**. Il ne modifie ni `main`, ni
aucune base existante : toute la mesure se fait dans une base de test
dédiée, créée puis détruite par les commandes ci-dessous. Aucun appel réseau
n'est nécessaire (toutes les données sont versionnées).

## 0. Ce que l'on reproduit exactement

Sur les incidents publics de Nouvelle-Aquitaine de la fenêtre
**2025-11-01 → 2026-10-31** :

> **Couverture : 28 / 42 (66,7 %)**, soit 28 incidents reconnus par le moteur
> sur 42 incidents dans la fenêtre. Lecture plus exigeante : **26 / 42 (61,9 %)**
> de rattachements défendables (21 exacts, 5 partiels, 2 hors sujet).

Comptes associés, indissociables du chiffre :

| Grandeur | Valeur attendue |
| --- | --- |
| Corpus | 60 incidents, dont 42 dans la fenêtre et 18 hors fenêtre |
| `pas_admis` (porte d'admission du contrat) | 0 |
| `pas_rattache` | 14, tous classés `absent_du_referentiel` |
| `au_referentiel_mais_non_reconnu` | 0 |
| Organisations en base (`SELECT count(*) FROM org`) | **4 480** |
| Alias actifs chargés dans le gazetteer | **22 947** |
| Lignes entreprise dans les 4 secteurs attendus | **0** → mention « taux non publiable » |
| Délai médian | non mesuré ici (`delaiJours = null` pour les 60 incidents) |

Le chiffre est **lié à l'état de la base** : la recette ci-dessous épingle cet
état à 4 480 organisations. Toute autre base (en particulier une base SIRENE
complète) donne d'autres diagnostics, même si le numérateur retombe à 28.
Référence publiée : `docs/couverture-mesuree.md`.

## 1. Prérequis et empreintes

Ouvrir un shell, puis :

```bash
cd /data/home/loop/wt-couv-reproduction
node --version                 # v22.23.3
pnpm --version                 # 12.15.0
command -v psql jq             # les deux doivent être présents
git status --short --branch    # worktree propre, sur la branche de reproduction
```

Un PostgreSQL joignable est nécessaire sur `127.0.0.1:5432` avec le couple
`radar` / `radar` (c'est le socle standard du projet, voir `docs/demarrage.md`).
Si aucun serveur n'est disponible, ouvrir **un second terminal** dans le même
worktree et lancer `PGDATA=./pgdata-couv PGPORT=5433 pnpm db:up`, puis
remplacer `5432` par `5433` dans toutes les commandes ci-dessous. Ne jamais
réutiliser un répertoire `pgdata` appartenant à un autre worktree.

Vérifier d'abord les fichiers d'entrée (un écart = un autre état de dépôt) :

```bash
sha256sum \
  bench/fixtures/corpus-reference-na.json \
  scripts/mesure-couverture.mts \
  db/data/referentiel-na.json \
  db/data/referentiel-complement-2026-11-13.json \
  db/data/referentiel-complement-2026-11-14.json
```

Résultat attendu :

```text
a6634b37f84e896f2c3395e21004aea8d289e6b6362f3908a64bdcd017cdd995  bench/fixtures/corpus-reference-na.json
68432c4ecc1b2d35853819a90edd9d98e29e11f05ed4337c5d8e0b73a318167b  scripts/mesure-couverture.mts
68e28d06e065cc40c40434d2f987716c18faf70df970e7b332d2ded7e4e3bdcb  db/data/referentiel-na.json
ed7001527cb1a78b8c1fe014fb2322182c228bc1c492e600e9771731dcb11d8c  db/data/referentiel-complement-2026-11-13.json
b58172f13b495c849bf940de7008fe153bb3fcf65fc490f53da96edc0d916648  db/data/referentiel-complement-2026-11-14.json
```

## 2. Le corpus et sa fenêtre (lecture seule)

Le corpus est le fichier versionné `bench/fixtures/corpus-reference-na.json`
(60 incidents, chacun avec entité, date de publication, type, résumé et pièce
de preuve). La fenêtre est **codée en dur** dans le script
(`FENETRE = { debut: "2025-11-01", fin: "2026-10-31" }`), pas lue dans le
fichier : les vérifier séparément.

```bash
jq -c '.meta.fenetre' bench/fixtures/corpus-reference-na.json
jq '.incidents | length' bench/fixtures/corpus-reference-na.json
jq '[.incidents[] | select(.datePublique >= "2025-11-01" and .datePublique <= "2026-10-31")] | length' \
  bench/fixtures/corpus-reference-na.json
```

Résultat attendu, dans cet ordre :

```text
["2025-11-01","2026-10-31"]
60
42
```

Les 18 incidents hors fenêtre restent dans le corpus comme contexte ; ils ne
comptent ni dans le numérateur ni dans le dénominateur.

## 3. Ordre des opérations (à respecter à la lettre)

| Ordre | Action | Contrôle immédiat |
| --- | --- | --- |
| 1 | Vérifier les empreintes et le corpus (§ 1, § 2) | 5 hashes, `60`, `42` |
| 2 | Créer une base de test **vide** dédiée | `CREATE DATABASE` |
| 3 | `pnpm setup` : schéma, 52 migrations, sources, règles, 4 462 orgs | `4462 organisations` |
| 4 | Charger les deux compléments **dans l'ordre 13 puis 14 novembre** | `4 480` orgs au total |
| 5 | Contrôler les tables et les requêtes SQL (§ 5) | 22 947 alias actifs, `0` ligne hors numérique |
| 6 | Lancer la mesure avec `--json` (§ 6) | `28/42 (66.7 %)` |
| 7 | Vérifier le JSON publié (§ 7) | `vus = 28`, `total = 42`, `taux = 66.7` |
| 8 | Détruire la base de test (§ 9) | `DROP DATABASE` |

L'ordre des étapes 3 et 4 est essentiel : avec le seul socle (4 462 orgs), la
mesure donne **6/42 (14,3 %)**, pas 28/42. Ce sont les 18 entités des deux
compléments qui produisent le chiffre publié. Ne pas charger les jeux SIRENE
(`scripts/import-sirene*.mts`, `scripts/import-entreprises-na.mts`) : ils
changeraient l'état de base et les causes d'absence.

## 4. Construction de la base de test

```bash
export DB=couv_reproduction_doc
export PGPASSWORD=radar
export DATABASE_URL="postgres://radar:radar@127.0.0.1:5432/$DB"

# N'UTILISER QUE sur ce nom de base : cette commande efface une base existante
# portant exactement ce nom. Ne jamais remplacer $DB par "radar".
psql -h 127.0.0.1 -U radar -d postgres \
  -c "DROP DATABASE IF EXISTS $DB" \
  -c "CREATE DATABASE $DB OWNER radar"

RADAR_ADMIN_EMAIL=admin@radar.local \
RADAR_ADMIN_PASSWORD=demo-couv-repro \
pnpm setup
```

Extraits attendus de `pnpm setup` (les lignes intermédiaires de migrations sont
omises ici) :

```text
✓ connexion                    PostgreSQL 18.7
✓ schéma                       db/init.sql appliqué
✓ migrations                   52/52 appliquées
chargé : 4462 organisations, 22904 alias
✓ référentiel NA               4462 orgs / 22904 alias
✓ échantillon quarantaine      500 faits
✓ journal de vérité            table présente, append-only et projections vérifiés
Socle : 9/9 étapes en place.
```

Puis, toujours dans le même shell et **dans cet ordre** :

```bash
apps/api/node_modules/.bin/tsx scripts/load-referentiel-complement.mts \
  --fichier=db/data/referentiel-complement-2026-11-13.json --apply
# → Appliqué · 5 entité(s) · 5 création(s), 0 mise(s) à jour, 6 alias

apps/api/node_modules/.bin/tsx scripts/load-referentiel-complement.mts \
  --fichier=db/data/referentiel-complement-2026-11-14.json --apply
# → Appliqué · 13 entité(s) · 13 création(s), 0 mise(s) à jour, 37 alias
```

Contrôle d'état final avant mesure :

```bash
psql -h 127.0.0.1 -U radar -d "$DB" \
  -c "SELECT count(*) AS orgs FROM org;" \
  -c "SELECT kind, count(*) FROM org GROUP BY 1 ORDER BY 2 DESC;" \
  -c "SELECT count(*) AS alias FROM org_alias;"
```

Résultat attendu :

```text
 orgs
------
 4480
(1 row)

    kind     |  count
-------------+---------
 collectivite |  4462
 entreprise   |    12
 autre        |     4
 enseignement |     1
 sante        |     1
(5 rows)

 alias
-------
 22947
(1 row)
```

## 5. Tables et requêtes SQL exactes, dans l'ordre d'exécution

Deux tables portent la mesure : **`org`** (`id`, `name`, `kind`, `sector`,
`dept`, `city`, `entity_code`, `entity_source`, `status`, …) et **`org_alias`**
(`org_id`, `alias`, `nom_normalise`, `source`, `status`). Le script ne lit ni
`event`, ni `source`, ni `quarantine_raw` : il reconstruit chaque événement en
mémoire et ne fait que des `SELECT` sur le référentiel. `db/init.sql` crée le
schéma ; `db/migrate-*.sql` ajoutent les colonnes utilisées ci-dessous.

### 5.1 Chargement du gazetteer — 1 requête

`apps/api/src/collectors/org-gazetteer.ts`, appelée par `getGazetteer()` au
début de la mesure :

```sql
SELECT a.org_id, o.name, o.kind, o.dept, o.city, o.sector, a.alias, a.nom_normalise, a.source
  FROM org_alias a
  JOIN org o ON o.id = a.org_id
 WHERE a.status = 'active';
```

Contrôle équivalent :

```bash
psql -h 127.0.0.1 -U radar -d "$DB" -Atc \
  "SELECT count(*) FROM org_alias a JOIN org o ON o.id = a.org_id WHERE a.status = 'active';"
```

Résultat attendu : `22947`.

### 5.2 Nombre d'organisations — 1 requête

`scripts/mesure-couverture.mts` :

```sql
SELECT count(*)::text AS n FROM org;
```

Résultat attendu : `n = 4480` (c'est cette valeur qui est publiée dans
`organisationsEnBase`, pas la chaîne codée en dur du champ `method.moteur`).

### 5.3 Diagnostic de chaque incident non rattaché — 14 requêtes

`existeAuReferentiel()` dans `scripts/mesure-couverture.mts` :

```sql
SELECT name FROM org WHERE name ILIKE $1 LIMIT 300;
```

`$1` vaut `%<sonde>%`, où la sonde est le **mot le plus long** du nom de
l'entité (avant `(` / `—`, minuscules, accents retirés, article écarté) ; le
script vérifie ensuite que le nom normalisé commence par le nom attendu (ou,
pour un sigle d'un seul mot, que le mot figure dans le nom). Exemple rejouable
à la main pour `na-2026-001` :

```bash
psql -h 127.0.0.1 -U radar -d "$DB" \
  -c "SELECT name FROM org WHERE name ILIKE '%ymed%' LIMIT 300;"
```

Résultat attendu : `(0 rows)`. Les 14 sondes de la fenêtre renvoient 0 ligne :
les 14 incidents `pas_rattache` sont donc classés `absent_du_referentiel` et
aucun `au_referentiel_mais_non_reconnu`. Les identifiants concernés sont
donnés en § 7.

### 5.4 Garde-fou de publication — 2 requêtes

```sql
SELECT COALESCE(sector, kind) AS secteur, count(*)::text AS n
  FROM org WHERE kind = 'entreprise'
 GROUP BY 1 ORDER BY 2 DESC;
```

```bash
psql -h 127.0.0.1 -U radar -d "$DB" \
  -c "SELECT COALESCE(sector, kind) AS secteur, count(*)::text AS n FROM org WHERE kind = 'entreprise' GROUP BY 1 ORDER BY 2 DESC;"
```

Résultat attendu : une seule ligne, `entreprise | 12` (les 12 entreprises des
compléments n'ont pas de secteur renseigné, le script retombe donc sur `kind`).

```sql
SELECT count(*)::text AS n FROM org
 WHERE kind = 'entreprise'
   AND sector IN ('agroalimentaire', 'industrie', 'construction', 'commerce');
```

```bash
psql -h 127.0.0.1 -U radar -d "$DB" \
  -c "SELECT count(*)::text AS n FROM org WHERE kind = 'entreprise' AND sector IN ('agroalimentaire','industrie','construction','commerce');"
```

Résultat attendu : `n = 0`. La logique JavaScript
`verifierPubliabilite()` (`apps/api/src/analyse/publiabilite.ts`) exige au
moins 3 des 4 secteurs ; avec 0/4, elle ajoute la mention « taux non
publiable » au chiffre. Ce n'est pas une erreur de la mesure : c'est le trou
de référentiel publié à côté du taux.

### 5.5 Contrôle de précision — 1 requête (0 ligne ici)

```sql
SELECT id, entity_code AS code FROM org WHERE entity_source = 'referentiel-na';
```

```bash
psql -h 127.0.0.1 -U radar -d "$DB" \
  -c "SELECT id, entity_code AS code FROM org WHERE entity_source = 'referentiel-na';"
```

Résultat attendu : `(0 rows)`. La table de correspondance commune/code INSEE
est vide dans cet état ; elle n'influe donc pas sur le résultat.

## 6. Mesure

Toujours dans le même shell (`DATABASE_URL` pointe sur la base de test) :

```bash
apps/api/node_modules/.bin/tsx scripts/mesure-couverture.mts \
  --json=/tmp/couverture-reproduction.json
```

Sortie console attendue (intégrale ; seule la date de la première ligne
dépend du jour d'exécution) :

```text
Mesure de couverture — 2026-11-21
Fenêtre 2025-11-01 → 2026-10-31 · corpus 60 incidents
Organisations en base : 4480

   —  na-2026-001  Ymed (éditeur de la plateforme Sooncare) non rattaché — absent du référentiel (null)
  VU  na-2026-002  Mairie de Marennes-Hiers-Brouage         → mairie de marennes hiers brouage
  VU  na-2026-003  Ville de Tarnos                          → ville de tarnos
  VU  na-2026-004  Mairie d'Espelette                       → mairie d espelette
   —  na-2026-005  EHPAD Résidence du Parc de Champdeniers  non rattaché — absent du référentiel (null)
  VU  na-2026-006  Ville de Gradignan — police municipale   → ville de gradignan
  VU  na-2026-009  Bordeaux Sciences Agro                   → bordeaux sciences agro
  VU  na-2026-010  Vignobles Toutigeac                      → vignobles toutigeac
  VU  na-2026-011  SICSOE (Solution Vin Logistique)         → sicsoe solution vin logistique
  VU  na-2026-012  Intermarché d'Altillac                   → intermarche
  VU  na-2026-013  Magasins de grande distribution touchés  → intermarche
   —  na-2026-016  Fédération Nationale des Chasseurs / cha non rattaché — absent du référentiel (null)
   —  na-2026-018  Fédération Française de Cyclisme — membr non rattaché — absent du référentiel (null)
   —  na-2026-019  Delicity — service de livraison de repas non rattaché — absent du référentiel (null)
  VU  na-2026-020  Euskal Moneta (association support de la → euskal moneta
   —  na-2026-021  SDIS des Landes                          non rattaché — absent du référentiel (null)
   —  na-2026-022  Institut Bergonié                        non rattaché — absent du référentiel (null)
  VU  na-2026-023  ERNAT (Études Réalisations Négoce Assist → ernat
   —  na-2026-024  Rectorat de l'académie de Poitiers       non rattaché — absent du référentiel (null)
  VU  na-2026-025  UPPA Alumni — réseau des anciens de l'Un → uppa alumni
  VU  na-2026-026  Réseau Alumni de l'Université de Bordeau → alumnforce
  VU  na-2026-027  UNSS (Union nationale du sport scolaire) → union nationale du sport scolaire
  VU  na-2026-028  Ville de La Rochelle — fuite via le pres → ville de la rochelle
   —  na-2026-029  Bordeaux Métropole — portail de la taxe  non rattaché — absent du référentiel (null)
   —  na-2026-030  Ministère de l'Intérieur — intrusion ini non rattaché — absent du référentiel (null)
   —  na-2026-031  Vivaticket France (Chasseneuil-du-Poitou non rattaché — absent du référentiel (null)
  VU  na-2026-032  Intermarché de Gradignan, Parempuyre, Ma → intermarche
  VU  na-2026-033  Supermarchés des Deux-Sèvres (Hyper U Pa → hyper u
  VU  na-2026-034  Cinq Intermarché de Dordogne (Hautefort, → intermarche
  VU  na-2026-035  E.Leclerc de Surgères                    → e leclerc
  VU  na-2026-036  Magasins de la Vienne (Intermarché Chauv → intermarche
  VU  na-2026-037  Super U de Morcenx-la-Nouvelle et Carref → super u
  VU  na-2026-038  Intermarché et Carrefour Market de Marma → intermarche
   —  na-2026-039  Cerballiance — réseau de laboratoires de non rattaché — absent du référentiel (null)
   —  na-2026-040  Cegedim Santé — logiciel MonLogicielMedi non rattaché — absent du référentiel (null)
  VU  na-2026-041  Polyclinique Bordeaux Nord Aquitaine     → polyclinique bordeaux nord aquitaine
  VU  na-2026-042  Ville de Limoges — centre de vaccination → ville de limoges
  VU  na-2026-043  Weda — logiciel médical (cabinets touché → weda
  VU  na-2026-044  FFRandonnée — fichier adhérents          → federation francaise de la randonnee pedestre
  VU  na-2026-045  Association des maires de France (AMF)   → association des maires de france
  VU  na-2026-046  Office français de la biodiversité — fic → office francais de la biodiversite
   —  na-2026-060  Cdiscount — extraction frauduleuse de do non rattaché — absent du référentiel (null)

Couverture : 28/42 (66.7 %) · non admis 0 · non rattachés 14
  taux non publiable : Référentiel incomplet : 0/4 secteurs attendus présents (0 %), sous le seuil de 75 %. Secteurs sans aucune ligne : agroalimentaire, industrie, construction, commerce. Le taux de couverture serait trompeur pour ces secteurs.
  dont 14 organisation(s) absente(s) du référentiel et 0 présente(s) mais non reconnue(s) par le moteur
Qualité du rattachement : 21 exacte(s), 5 partielle(s), 2 hors sujet — 26/42 (61.9 %) défendable(s)
Référentiel entreprises : 0 ligne(s) en agro/industrie/BTP/commerce
(trou publié à côté du taux, jamais masqué)

mesure publiée : /tmp/couverture-reproduction.json
```

Le dénominateur est bien 42 : seuls les incidents dont `datePublique` est dans
la fenêtre sont comptés. La ligne « non publiable » est la mention attendue
dans cet état de base.

## 7. Vérification du JSON publié

```bash
jq '{dateMesure, fenetre, corpus, organisationsEnBase, couverture,
     publication: {publiable: .publication.publiable,
                   mention: .publication.mention,
                   secteursManquants: .publication.secteursManquants},
     referentielEntreprises: {
       lignesHorsNumerique: .referentielEntreprises.lignesHorsNumerique,
       parSecteur: .referentielEntreprises.parSecteur}}' \
  /tmp/couverture-reproduction.json
```

Résultat attendu (`dateMesure` = jour d'exécution) :

```json
{
  "dateMesure": "2026-11-21",
  "fenetre": { "debut": "2025-11-01", "fin": "2026-10-31" },
  "corpus": { "incidents": 60, "dansLaFenetre": 42, "horsFenetre": 18 },
  "organisationsEnBase": 4480,
  "couverture": {
    "vus": 28,
    "qualite": { "exacte": 21, "partielle": 5, "hors_sujet": 2 },
    "vusDefendables": 26,
    "total": 42,
    "taux": 66.7,
    "motifs": { "vu": 28, "pas_admis": 0, "pas_rattache": 14 },
    "causes": { "absent_du_referentiel": 14, "au_referentiel_mais_non_reconnu": 0 }
  },
  "publication": {
    "publiable": false,
    "mention": "taux non publiable",
    "secteursManquants": ["agroalimentaire", "industrie", "construction", "commerce"]
  },
  "referentielEntreprises": {
    "lignesHorsNumerique": 0,
    "parSecteur": { "entreprise": 12 }
  }
}
```

Contrôle des 14 absences et de l'absence de délai :

```bash
jq -r '.incidents[] | select(.motif == "pas_rattache") | .id' \
  /tmp/couverture-reproduction.json
jq '[.incidents[] | select(.delaiJours != null)] | length' \
  /tmp/couverture-reproduction.json
```

Résultat attendu : les 14 identifiants ci-dessous, puis `0` :

```text
na-2026-001
na-2026-005
na-2026-016
na-2026-018
na-2026-019
na-2026-021
na-2026-022
na-2026-024
na-2026-029
na-2026-030
na-2026-031
na-2026-039
na-2026-040
na-2026-060
```

## 8. Pièges à ne pas confondre avec le résultat

- **`method.moteur`** du JSON contient la chaîne codée en dur
  « 34 330 organisations réelles ». Ce n'est pas un comptage : la valeur qui
  fait foi est `organisationsEnBase = 4480`, issue de la requête SQL § 5.2.
- **66,7 % ≠ 61,9 %.** Le taux brut compte deux rattachements « hors sujet »
  (`na-2026-026`, `na-2026-044`) ; le taux défendable les exclut. Les deux
  chiffres sont publiés côte à côte, pas choisis.
- **Aucun délai.** `delaiJours` vaut `null` pour les 60 incidents : le corpus
  est rejoué contre le moteur, il n'est pas ingéré. Le délai réel se mesure
  dans `scripts/mesure-delai.mts`, pas ici.
- **Exhaustivité du corpus.** Seuls les incidents rendus publics et vérifiés
  sur pièce entrent dans le dénominateur ; les incidents non médiatisés en sont
  exclus par construction.
- **Admission.** `pas_admis = 0` signifie que la nature des incidents du corpus
  ne déclenche aucun refus du contrat, pas que toute source réelle est admise.
- **État de base.** Ne pas réutiliser la base `radar` existante (elle contient
  des centaines de milliers d'organisations issues des vagues SIRENE) : les
  causes d'absence y sont différentes. La recette ci-dessus part d'une base
  vierge et n'ajoute que les 18 entités des deux compléments.

## 9. Nettoyage

Une fois la comparaison faite, détruire uniquement la base de test :

```bash
psql -h 127.0.0.1 -U radar -d postgres -c "DROP DATABASE $DB"
rm -f /tmp/couverture-reproduction.json
```

Le dépôt reste inchangé (aucun fichier généré dans le worktree) ; le résultat
est reproductible en relançant simplement les § 3 à 8.
