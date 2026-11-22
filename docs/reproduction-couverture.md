# Reproduire le chiffre de couverture publié

Ce document permet à un tiers de retrouver, depuis un clone propre et **sans
réseau**, le chiffre publié : **0 % (0/50)** sur le corpus consolidé de 50
incidents, Fenêtre `2024-04-19 → 2026-10-14`, `publiable: true`, empreinte
SHA-256 `fee9681c3869baffa645ac20b1679edb82c45597433185923734c4cdf0397c26`.

## Prérequis

- Clone du dépôt (déjà sur disque ou issu d'un miroir local), dépendances
  installées avec `pnpm install --offline` : le binaire `apps/api/node_modules/.bin/tsx`
  et le paquet `embedded-postgres` sont alors présents.
- Node >= 20, `pnpm`, `node`, `psql`, `createdb`, `dropdb`, `pg_isready` sur le
  `PATH` ; PostgreSQL >= 16 avec l'extension `unaccent` (fournie par
  `embedded-postgres` si aucun serveur ne tourne déjà).
- Aucun accès réseau : ni le corpus, ni l'état de base, ni le rapport publié ne
  sont téléchargés. Aucune donnée personnelle de victime n'est stockée.

## Commande unique

```bash
bash scripts/reproduire.sh
```

Depuis un clone vierge :

```bash
pnpm install --offline
bash scripts/reproduire.sh
```

Variables facultatives : `REPRO_PGHOST` (défaut `127.0.0.1`), `REPRO_PGPORT`
(`5433`), `REPRO_PGUSER` / `REPRO_PGPASSWORD` (`radar` / `radar`). Si aucun
serveur ne répond, le script démarre le PostgreSQL intégré avec `pnpm db:up`
dans un répertoire temporaire, puis l'arrête. Il ne touche jamais à la base
`radar` existante : il crée une base éphémère et la supprime à la fin.

## Ordre des étapes

1. Contrôle des fichiers versionnés : corpus, `HASH`, rapport publié, binaire `tsx`.
2. Détection de PostgreSQL ; démarrage intégré si besoin.
3. Création d'une base éphémère et application de
   `bench/couverture/reproduction-fixture.sql` : 75 sources (26 catalogue, 43
   Landes, 3 corpus Vienne, 1 communiqué officiel, 2 flux publics), 4
   organisations (un secteur attendu chacun), aucun événement dans la fenêtre,
   un événement sentinelle hors fenêtre pour fixer `dateCalcul`.
4. `scripts/mesure-couverture-systeme.mts --check` : rejeu des 50 incidents et
   comparaison structurelle au rapport publié (y compris `parMotif`,
   `parDepartement`, `parType` et `incidents`).
5. Second rejeu `--json=` vers un fichier temporaire ; lecture de
   `hashCorpus`, `global`, `publication` et comparaison aux constantes publiées
   (ainsi qu'à `bench/couverture/HASH`).
6. Suppression de la base temporaire et du répertoire PostgreSQL intégré.

Durée observée : quelques dizaines de secondes, très en deçà de 5 minutes.

## Corpus

`bench/couverture/incidents.jsonl` : 50 lignes, une par incident, dédupliquées
par `id`, triées par `id` (`localeCompare("fr")`) puis resérialisées avec
`JSON.stringify`. C'est ce texte canonique qui est haché, pas l'ordre des
fichiers ni celui des lignes. Le fichier `bench/couverture/HASH` contient
l'empreinte publiée. Le catalogue complet est décrit dans
`bench/couverture/README.md` : 12 départements, 6 types, 17 éditeurs distincts,
part maximale 30 % (Sud Ouest, 15/50), 909 jours calendaires.

## Requêtes SQL exactes

Elles sont exécutées une fois par incident (1 et 2 en parallèle, 3 seulement si
des sources ont été trouvées). Les paramètres sont pré-normalisés côté TypeScript
comme indiqué.

### 1 — Événement correspondant (`SQL_EVENEMENTS`)

`$1` = URL normalisée, `$2` = titre normalisé, `$3` = organisation normalisée,
`$4` = date de publication.

```sql
WITH demande AS (SELECT $1::text AS url, $2::text AS titre, $3::text AS org, $4::date AS jour),
tout AS (
	SELECT 'event' AS table_source, e.id::text AS id, e.org_id, NULL::text AS org_name,
	       e.family, e.source_id, e.source_url, e.title, e.observed_at, e.collected_at
	  FROM event e
	UNION ALL
	SELECT 'event_archive' AS table_source, a.id::text AS id, a.org_id, a.org_name,
	       a.family, a.source_id, a.source_url, NULL::text AS title, a.observed_at, a.collected_at
	  FROM event_archive a
)
SELECT t.table_source, t.id, t.org_id, t.org_name, t.family, t.source_id,
       t.source_url, t.title, t.observed_at, t.collected_at
  FROM tout t CROSS JOIN demande d
 WHERE (t.source_url IS NOT NULL AND regexp_replace(regexp_replace(regexp_replace(lower(t.source_url), '^https?://(www\.)?', ''), '[?#].*$', ''), '/+$', '') = d.url)
    OR (t.title IS NOT NULL AND trim(regexp_replace(unaccent(lower(t.title)), '[^a-z0-9]+', ' ', 'g')) = d.titre AND t.observed_at::date = d.jour)
    OR (t.org_name IS NOT NULL AND trim(regexp_replace(unaccent(lower(t.org_name)), '[^a-z0-9]+', ' ', 'g')) = d.org AND t.observed_at::date = d.jour)
 ORDER BY t.collected_at ASC
 LIMIT 100
```

Un incident est `vu` seulement si la ligne retenue porte un `org_id` non nul.

### 2 — Média déclaré et collecté ce jour (`SQL_COLLECTE`)

`$1` = hôte de l'URL, `$2` = éditeur normalisé, `$3` = date de publication.

```sql
WITH demande AS (SELECT $1::text AS host, $2::text AS media, $3::date AS jour),
sources AS (
	SELECT s.* FROM source s CROSS JOIN demande d
	 WHERE (d.host <> '' AND position(d.host in lower(coalesce(s.url, ''))) > 0)
	    OR (d.media <> '' AND (
	          position(d.media in trim(regexp_replace(unaccent(lower(s.name)), '[^a-z0-9]+', ' ', 'g'))) > 0
	       OR position(trim(regexp_replace(unaccent(lower(s.name)), '[^a-z0-9]+', ' ', 'g')) in d.media) > 0))
)
SELECT s.id, s.name, s.family, s.url, s.enabled, s.last_ok_at,
       (SELECT count(*)::int FROM collector_run r
         WHERE r.source_id = s.id AND r.started_at::date = d.jour) AS executions_du_jour,
       (SELECT count(*)::int FROM event e
         WHERE e.source_id = s.id AND e.collected_at::date = d.jour) AS evenements_du_jour,
       (SELECT max(r.started_at) FROM collector_run r WHERE r.source_id = s.id) AS derniere_execution
  FROM sources s CROSS JOIN demande d
 ORDER BY s.id
```

### 3 — Production autour de la publication (`SQL_FILTRE`)

`$1` = date de publication, `$2` = identifiants des sources trouvées en 2.

```sql
WITH demande AS (SELECT $1::date AS jour)
SELECT coalesce(e.family, '(aucune)') AS famille, count(*)::int AS evenements
  FROM event e CROSS JOIN demande d
 WHERE e.source_id = ANY($2::text[])
   AND e.collected_at::date BETWEEN d.jour - INTERVAL '7 days' AND d.jour + INTERVAL '7 days'
 GROUP BY 1 ORDER BY 2 DESC, 1
```

### 4 — État de la base (`SQL_ETAT_BASE`)

```sql
SELECT (SELECT max(collected_at)::date FROM event) AS derniere_collecte,
       (SELECT max(started_at)::date FROM collector_run) AS derniere_execution,
       (SELECT count(*)::int FROM event) AS evenements,
       (SELECT count(*)::int FROM event_archive) AS evenements_archives,
       (SELECT count(*)::int FROM source) AS sources,
       (SELECT count(*)::text FROM org) AS organisations
```

### 5 — Secteurs du référentiel (`SQL_SECTEURS`)

```sql
SELECT COALESCE(sector, kind) AS secteur, count(*)::text AS n
  FROM org WHERE kind = 'entreprise' GROUP BY 1 ORDER BY 2 DESC
```

Les quatre garde-fous sont ensuite évalués par
`apps/api/src/analyse/seuils-couverture.ts` avant tout taux : 50 incidents (>=
30), 4 secteurs sur 4 (>= 3), 17 éditeurs avec part max 30 % (<= 50 %), 909
jours (>= 90).

## Résultats attendus

```
couverture conforme : 0 % (0/50)
empreinte SHA-256 : fee9681c3869baffa645ac20b1679edb82c45597433185923734c4cdf0397c26
couverture : 0 % (0/50)
publiable : true
reproduction conforme
```

Détail : `motifs` = `vu=0 · pas_collecte=50 · pas_rattache=0 ·
pas_juge_cyber=0 · indetermine=0` ; les 12 départements et 6 types sont à 0/50 ;
`delaiMedianHeures` est `null` ; `publication.mention` et `raison` sont `null`,
`refus` est vide. Sortie 0 ; toute divergence fait sortir 1 avec le champ en
faute.

## Écarts acceptables

- `base` (compteurs et empreinte) diffère de la mesure d'origine : le jeu figé
  porte 26 sources, 1 événement sentinelle, 0 archive et 4 organisations,
  contre 312 / 26 719 / 4 710 / 1 673 151 dans la base de travail du
  21 novembre 2026. Ces champs ne font pas le chiffre publié et sont ignorés
  par `--check`.
- `dateCalcul` vaut `2026-11-21`, issu de l'événement sentinelle ; il ne fait
  pas partie du chiffre.
- Le rapport publié n'est pas réécrit : le second rejeu cible un fichier
  temporaire, supprimé en fin d'exécution.
- L'hôte, le port, le nom de la base temporaire et le répertoire PostgreSQL
  intégré peuvent varier ; le corpus, lui, ne peut pas varier.

Ne sont **pas** acceptables : un écart d'empreinte, de `vus` / `total` / `taux`,
de `publiable` / `raison`, ou de l'une des décompositions et preuves
(`parMotif`, `parDepartement`, `parType`, `incidents`). Le script échoue alors
en nommant le champ divergent.
