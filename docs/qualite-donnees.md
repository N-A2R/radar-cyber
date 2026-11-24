# Qualité des données — 2026-11-21

Généré le 2026-11-21 à 18:44:05 (Europe/Paris) · base : `postgres://radar:radar@localhost:5433/radar` · lecture seule (`BEGIN READ ONLY` … `ROLLBACK`).

Chaque chiffre ci-dessous est le résultat d'une requête SQL exécutée pendant la génération ; la requête est publiée telles quelles dans sa section.

## Synthèse

| Indicateur | Mesure | Détail |
| --- | ---: | --- |
| Organisations sans domaine | 1 673 063 | 1 673 151 organisations, 99,99 % |
| Alias en doublon (alias normalisé) | 91 259 valeurs | 287 963 lignes concernées ; brut : 90 368 valeurs / 285 828 lignes |
| Événements sans organisation | 26 897 | 27 013 événements ; 11 régionaux |
| Sources rouges (7 j sans fait) | 229 | 119 actives sur 312 sources |
| Sources mortes | 0 | `source.statut = 'morte'` |
| File en attente | 345 | 145 sans indice |
| Indice famille `domaine` | 163 | 47,25 % de la file |
| Indice famille `sigle` | 0 | 0 % de la file |
| Indice famille `nom` | 37 | 10,72 % de la file |
| Indice famille `vide` | 145 | 42,03 % de la file |

## 1. Organisations sans domaine

**Définition / périmètre.** Toutes les lignes de `org` dont `domain` est NULL ou vide après `btrim`. Le total et le pourcentage sont calculés dans la même requête.

**Résultat.** 1 673 063 organisations sans domaine sur 1 673 151 (99,99 %).

```sql
SELECT
       (count(*) FILTER (WHERE domain IS NULL OR btrim(domain) = ''))::text AS sans_domaine,
       count(*)::text AS total,
       round(100.0 * count(*) FILTER (WHERE domain IS NULL OR btrim(domain) = '')
             / nullif(count(*), 0), 2)::text AS pourcentage
  FROM org
```

## 2. Alias en doublon

**Définition / périmètre.** Regroupement principal sur `lower(btrim(alias))` et non sur l'alias brut : les variantes de casse et d'espaces entourants désignent le même alias et sont des doublons réels pour la qualité du référentiel. La requête compte les valeurs répétées (GROUP BY … HAVING count(*) > 1), les lignes concernées, les lignes surnuméraires et les valeurs partagées par plusieurs organisations ; elle publie aussi, pour comparaison, les mêmes compteurs sur l'alias brut.

**Résultat.** 91 259 valeurs d'alias normalisées dupliquées, touchant 287 963 lignes (196 704 lignes surnuméraires, 287 959 valeurs partagées entre organisations). En alias brut : 90 368 valeurs dupliquées et 285 828 lignes concernées.

```sql
WITH brut AS (
  SELECT alias, count(*) AS lignes
    FROM org_alias
   WHERE alias IS NOT NULL AND btrim(alias) <> ''
   GROUP BY 1 HAVING count(*) > 1
),
doublons AS (
  SELECT lower(btrim(alias)) AS alias_normalise,
         count(*) AS lignes,
         count(DISTINCT org_id) AS orgs_distinctes
    FROM org_alias
   WHERE alias IS NOT NULL AND btrim(alias) <> ''
   GROUP BY 1 HAVING count(*) > 1
)
SELECT count(*)::text AS valeurs_dupliquees,
       coalesce(sum(lignes), 0)::text AS lignes_concernees,
       coalesce(sum(lignes - 1), 0)::text AS lignes_supplementaires,
       coalesce(sum(orgs_distinctes) FILTER (WHERE orgs_distinctes > 1), 0)::text AS valeurs_multi_org,
       (SELECT count(*)::text FROM brut) AS valeurs_dupliquees_brut,
       (SELECT coalesce(sum(lignes), 0)::text FROM brut) AS lignes_concernees_brut
  FROM doublons
```

## 3. Événements sans organisation

**Définition / périmètre.** Tous les événements dont `org_id` est NULL, avec le sous-ensemble `regional = true` (les faits locaux non rattachés sont les plus coûteux à qualifier manuellement).

**Résultat.** 26 897 événements sans organisation sur 27 013 (99,57 %), dont 11 régionaux sur 73.

```sql
SELECT
       count(*)::text AS total,
       count(*) FILTER (WHERE org_id IS NULL)::text AS sans_org,
       count(*) FILTER (WHERE org_id IS NULL AND regional = true)::text AS sans_org_regional,
       count(*) FILTER (WHERE regional = true)::text AS regional_total
  FROM event
```

## 4. Sources rouges et sources mortes

**Définition / périmètre.** Rouge : aucune date de fait `COALESCE(observed_at, collected_at)` au cours des 7 derniers jours, ou aucun fait — définition de `GET /api/health/detail` et `scripts/probe-red-sources.mts`. Morte : `source.statut = 'morte'` (décision explicite, migration 042). Les deux notions sont comptées par deux requêtes distinctes ; une source morte n'est pas retirée du décompte rouge.

**Résultat.** 229 sources rouges, dont 214 n'ont jamais produit de fait et 119 sont encore actives ; 0 sources déclarées mortes.

```sql
WITH dernier_fait AS (
  SELECT source_id, max(COALESCE(observed_at, collected_at)) AS dernier
    FROM event GROUP BY 1
)
SELECT count(*)::text AS rouges,
       count(*) FILTER (WHERE d.dernier IS NULL)::text AS sans_fait,
       count(*) FILTER (WHERE s.enabled)::text AS rouges_activees,
       (SELECT count(*)::text FROM source) AS total_sources
  FROM source s
  LEFT JOIN dernier_fait d ON d.source_id = s.id
 WHERE d.dernier IS NULL OR d.dernier < now() - interval '7 days'
```
```sql
SELECT count(*)::text AS mortes
  FROM source WHERE statut = 'morte'
```

## 5. Indices de file par famille

**Définition / périmètre.** File = `quarantine_raw` avec `promoted = false`, `kind = 'claim'`, `status = 'pending'`. La classification est entièrement faite en SQL (aucun appel à `classifierIndice` sur des lignes ramenées) : normalisation du domaine (schéma, chemin, port, points finaux, `www.`), regex d'hôte, liste blanche de TLD publics et liste noire des suffixes locaux, puis sigle = 2 à 6 lettres majuscules après compaction, au plus deux groupes de voyelles, hors vocabulaires génériques importés de `apps/api/src/match/generique.ts` (mêmes listes que le classifieur). Les listes de TLD sont celles de `famille-indice.ts`. Écart documenté : la normalisation JS de l'accentuation n'a pas d'effet ici, car un indice accentué ne peut pas correspondre à `^[A-Z]{2,6}$` ; la gestion des espaces unicode inhabituels suit `[[:space:]]` de PostgreSQL. La somme des quatre familles est vérifiée égale au total de la file.

**Résultat.** 345 lignes en attente : `domaine` 163 (47,25 %), `sigle` 0 (0 %), `nom` 37 (10,72 %), `vide` 145 (42,03 %). Sans indice : 145 ; somme des familles = 345 = total.

```sql
WITH file AS (
  SELECT id, org_hint
    FROM quarantine_raw
   WHERE promoted = false AND kind = 'claim' AND status = 'pending'
),
nettoye AS (
  SELECT id, org_hint,
         regexp_replace(lower(regexp_replace(org_hint, '^[[:space:]]+|[[:space:]]+$', '', 'g')),
                        '^[a-z][a-z0-9+.-]*://', '') AS sans_scheme
    FROM file
),
hotes AS (
  SELECT id, org_hint,
         regexp_replace(regexp_replace(
           split_part(regexp_replace(sans_scheme, '[/?#].*$', ''), ':', 1),
           '[.]+$', ''), '^(www[.])+', '') AS domaine_direct,
         (regexp_match(org_hint, '(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?[.])+[a-z]{2,}', 'i'))[1] AS domaine_texte
    FROM nettoye
),
domaines AS (
  SELECT id, org_hint,
         CASE
           WHEN domaine_direct ~ '^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?[.])+[a-z]{2,}$' THEN domaine_direct
           WHEN domaine_texte IS NOT NULL THEN
             regexp_replace(regexp_replace(lower(domaine_texte), '[.]+$', ''), '^(www[.])+', '')
         END AS domaine
    FROM hotes
),
classe AS (
  SELECT id, org_hint, domaine,
         upper(regexp_replace(
           regexp_replace(org_hint, '^[[:space:]]+|[[:space:]]+$', '', 'g'),
           '[.[:space:]]+', '', 'g')) AS compact
    FROM domaines
),
familles AS (
  SELECT CASE
           WHEN org_hint IS NULL OR btrim(org_hint) = '' THEN 'vide'
           WHEN domaine IS NOT NULL
                AND regexp_replace(domaine, '^.*[.]', '') IN ('ae', 'ar', 'au', 'br', 'ca', 'com', 'de', 'ec', 'edu', 'es', 'fr', 'hk', 'id', 'ie', 'in', 'ir', 'it', 'jp', 'ke', 'ma', 'mk', 'mx', 'mz', 'net', 'ng', 'nl', 'org', 'pa', 'pe', 'ph', 'sa', 'uk', 'us', 'vn', 'ai', 'app', 'biz', 'blog', 'cloud', 'co', 'dev', 'digital', 'eu', 'gouv', 'gov', 'info', 'int', 'io', 'me', 'mil', 'name', 'neo', 'ninja', 'online', 'pro', 'shop', 'site', 'store', 'tech', 'top', 'tv', 'xyz', 'at', 'be', 'ch', 'cl', 'cn', 'cz', 'dk', 'fi', 'gr', 'hu', 'il', 'kr', 'lu', 'no', 'nz', 'pl', 'pt', 'ro', 'ru', 'se', 'sg', 'sk', 'th', 'tr', 'tw', 'ua', 'za')
                AND regexp_replace(domaine, '^.*[.]', '') NOT IN ('dom', 'loc', 'local', 'test', 'invalid', 'internal')
             THEN 'domaine'
           WHEN compact ~ '^[A-Z]{2,6}$'
                AND CASE WHEN compact ~ '[AEIOUY]'
                         THEN cardinality(regexp_split_to_array(
                                btrim(regexp_replace(compact, '[^AEIOUY]+', ' ', 'g')), ' +'))
                         ELSE 0 END <= 2
                AND lower(compact) NOT IN ('ecole', 'elementaire', 'primaire', 'maternelle', 'publique', 'privee', 'college', 'lycee', 'ensemble', 'scolaire', 'groupe', 'section', 'enseignement', 'professionnel', 'technologique', 'general', 'generale', 'campus', 'institut', 'annexe', 'site', 'centre', 'service', 'services', 'maison', 'foyer', 'antenne', 'unite', 'secteur', 'hopital', 'hospitalier', 'clinique', 'pharmacie', 'laboratoire', 'cabinet', 'consultation', 'consultations', 'protection', 'infantile', 'soins', 'infirmiers', 'infirmier', 'pmi', 'msp', 'ehpad', 'eps', 'chs', 'cmp', 'csapa', 'carr', 'ciam', 'ime', 'sessad', 'iemp', 'upatou', 'ssiad', 'accueil', 'medicalise', 'medicalises', 'medical', 'medicale', 'social', 'sociale', 'reinsertion', 'aide', 'fam', 'mas', 'finess', 'etablissement', 'etablissements', 'polyvalent', 'polyvalents', 'adultes', 'handicapes', 'personnes', 'ages', 'enfants', 'jeunes', 'vie', 'logis', 'residence', 'retraite', 'sante', 'soin', 'permanent', 'ambulatoire', 'public', 'prive', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'pour', 'aux', 'au', 'en', 'sur', 'sous', 'chez', 'the', 'of', 'and', 'for', 'services', 'service', 'groupe', 'group', 'societe', 'entreprise', 'etablissement', 'etablissements', 'france', 'francais', 'francaise', 'international', 'internationale', 'holding', 'investissement', 'investissements', 'gestion', 'conseil', 'conseils', 'technologies', 'technology', 'solutions', 'systemes', 'system', 'numerique', 'informatique', 'digital', 'telecom', 'telecoms', 'nouvelle', 'aquitaine', 'europe', 'europeen', 'europeenne', 'sas', 'sarl', 'sci', 'scp', 'eurl', 'gie', 'snc', 'association', 'associations', 'the', 'host', 'agent', 'call', 'app', 'apps', 'web', 'mail', 'store', 'shop', 'home', 'house', 'one', 'plus', 'pro', 'max', 'direct', 'express', 'cloud', 'data', 'media', 'network', 'networks', 'systems', 'software', 'security', 'secure', 'platform', 'product', 'products', 'support', 'center', 'centre', 'central', 'first', 'next', 'best', 'top', 'world', 'wide', 'global', 'smart', 'tech', 'online', 'market', 'trade', 'business', 'company', 'partners', 'partner', 'office', 'lab', 'labs', 'studio', 'studios', 'agency', 'consulting', 'worker', 'workers', 'blog', 'blogs', 'tool', 'tools', 'framework', 'library', 'package', 'packages', 'module', 'modules', 'plugin', 'plugins', 'theme', 'template', 'demo', 'sample', 'api', 'ops', 'dev', 'builder', 'build', 'server', 'servers', 'hosting', 'backup', 'monitor', 'monitoring', 'gateway', 'router', 'switch', 'engine', 'runtime')
             THEN 'sigle'
           ELSE 'nom'
         END AS famille
    FROM classe
)
SELECT f.famille,
       coalesce(c.nb, 0)::text AS nb,
       (SELECT count(*)::text FROM file) AS total_file,
       (SELECT count(*)::text FROM file WHERE org_hint IS NULL OR btrim(org_hint) = '') AS sans_indice,
       (SELECT count(*)::text FROM file) AS verif_total
  FROM (VALUES ('domaine'), ('sigle'), ('nom'), ('vide')) AS f(famille)
  LEFT JOIN (SELECT famille, count(*) AS nb FROM familles GROUP BY famille) c ON c.famille = f.famille
 ORDER BY f.famille
```

## 6. Re-jeu du 24 novembre 2026 — événements régionaux sans organisation

Base `radar` lue en `BEGIN READ ONLY`. Le compte de la section 3 a bougé :

| Indicateur | 2026-11-21 | 2026-11-24 |
| --- | ---: | ---: |
| Événements | 27 013 | 27 098 |
| Sans organisation | 26 897 | 26 938 |
| Régionaux | 73 | 126 |
| Régionaux sans organisation | 11 | **51** |

```sql
SELECT count(*) total,
       count(*) FILTER (WHERE org_id IS NULL) sans_org,
       count(*) FILTER (WHERE regional) regionaux,
       count(*) FILTER (WHERE regional AND org_id IS NULL) regionaux_sans_org
  FROM event
```

Sur ces 51 lignes, **23 (45,1 %) portent `regional_motif = 'rattachement'`
alors que `org_id` est NULL**. C'est un drapeau périmé : le seul lien qui
justifiait `regional = true` a été défait par `reconcile-orgs`,
`repair-rattachements` ou `measure-attachment-coherence`, sans recalcul de la
portée. Lot nominatif : les 20 revendications `126770` à `126789` (`lyon.co.uk`,
`hotel-ampere-paris.com`, `upperweb.com.br`…), toutes promues le 21 novembre,
dont le texte ne nomme aucun département ; plus `24227`, `116469`, `128330`,
dont le journal porte `attachment.coherence`.

```sql
SELECT id, regional_motif, left(title, 90) titre
  FROM event
 WHERE regional AND org_id IS NULL AND regional_motif = 'rattachement'
 ORDER BY id
```

Rejoué avec `porteeRegionale(titre || ' ' || résumé, null)`, le recalcul rend
**22 de ces 23 lignes non régionales** (`motif = 'aucun'`) ; la troisième,
`116469`, reste régionale avec le motif `departement` (« Pyrénées-Atlantiques »).
Le plafond réel est donc **29 événements régionaux sans org**, pas 51. Les
motifs `departement` (21) et `nouvelle-aquitaine` (7) sont conservés : ils
viennent du texte ou de la source, pas du lien défait.

Ce qui reste, classé par cause :

| Cause | Nombre | Détail |
| --- | ---: | --- |
| Pas jugé cyber | 16 | 7 communiqués régionaux sans fait cyber, 9 dépêches de presse (loup, vol de voiture, concours agricole, fermeture de verrerie…) admises par la règle « département cité ». |
| Pas rattaché, sans victime qualifiable | 13 | 8 doublons du séminaire « Pyrénées-Atlantiques : hausse de 37,4 % des infractions numériques », 3 articles Soluris (prestataire, pas victime), `24266` (préfecture des Landes : aucune organisation de ce nom au référentiel), `48007` (deux sociétés `SECURITEST` homonymes, aucune à Vienne). |
| Rattachement justifié possible | **0** | Le moteur de production ne propose aucun lien défendable sur ces 13 textes ; sur `24266` il propose `233961` (« FERMETURES AUTOMATISMES CONFORT THERMIQU », Dax), sans rapport avec une préfecture. |

La file de revue ne change pas ce plafond : `tsx scripts/trier-revue.mts` en
dry-run classe ses **374 lignes en attente** en 0 `region`, 148 `hors_perimetre`
(indice vide ou trop court) et 226 `a_revoir` sans indice. Aucune revendication
régionale y est en attente d'un rattachement.

**Correctif livré.** `apps/api/src/match/detachement.ts` centralise le retrait
d'un lien : `org_id = NULL`, recalcul de `regional`/`regional_motif` **uniquement**
quand le motif était `rattachement`, et écriture au journal de l'avant/après
sans toucher à `event.evidence`. Les quatre chemins qui défont un lien
(`repair-rattachements`, `measure-attachment-coherence`, `reconcile-orgs`,
`declierEvenements` SIREN) l'utilisent. Un écart d'`org_id` annule l'opération.
Test sur base jetable : `tsx apps/api/test/run.ts apps/api/test/portee-apres-detachement.test.ts`
(4 cas verts). Les 22 lignes déjà périmées en production restent telles
quelles : la base est lue seule, aucun nettoyage rétroactif n'a été appliqué.

