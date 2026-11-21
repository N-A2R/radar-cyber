# Couverture mesurée — corpus de 20 incidents (21 novembre 2026)

## **0 % de couverture : 0 incident vu sur 20.**

Ce chiffre est calculé, pas estimé. Il vient de `bench/results/couverture-mesuree.json`,
produit par `scripts/mesure-couverture-systeme.mts` sur la base de travail
`postgres://radar:radar@localhost:5433/radar`, le **2026-11-21** (dernière collecte en base).
Aucun délai médian n'est publié : aucun incident n'est vu, donc aucun délai n'est mesurable.

- Corpus : `bench/couverture/incidents.jsonl`, 20 incidents, publications du
  2024-04-19 au 2026-09-15.
- Empreinte SHA-256 du corpus consolidé :
  `a367e4f3642c64972dfca8498afeafb21b96f1507899c90107539bd9b20cf78e`.
- État de la base au calcul : 312 sources, 26 719 événements, 4 710 événements
  archivés, 1 673 151 organisations ; 7 781 exécutions de collecte du
  2026-11-13 au 2026-11-21. Empreinte des lignes lues :
  `80de9f90ae633b31c35d5598cafad74302207a6f14d65676b5a1e49198a53282`.

La route `GET /api/couverture` sert exactement ce rapport : `global`,
`parMotif`, `parDepartement`, `parType`, `dateCalcul`, `hashCorpus` et les
preuves par incident. Le test `apps/api/test/couverture-api.test.ts` rejoue le
script sur la base et échoue si le chiffre servi diverge, même d'un incident.

## Décomposition

| Motif | Incidents | Part |
| --- | ---: | ---: |
| `vu` | 0 | 0 % |
| `pas_collecte` | 20 | 100 % |
| `pas_rattache` | 0 | 0 % |
| `pas_juge_cyber` | 0 | 0 % |
| `indetermine` | 0 | 0 % |
| **Total** | **20** | **100 %** |

Par département (vus / total) : Charente 0/2, Charente-Maritime 0/2, Corrèze
0/1, Creuse 0/1, Deux-Sèvres 0/1, Dordogne 0/1, Gironde 0/6, Haute-Vienne 0/1,
Landes 0/1, Lot-et-Garonne 0/1, Pyrénées-Atlantiques 0/1, Vienne 0/2.

Par type (vus / total) : compromission 0/3, defacement 0/1, fuite 0/8,
ransomware 0/8.

Délai de collecte : non mesurable (0 incident vu). Le rapport expose tout de
même `delaiMedianHeures: null` plutôt qu'un zéro, qui laisserait croire à une
collecte instantanée.

### Preuve par incident

| Incident | Publication | Département | Motif | Délai (h) | Preuve |
| --- | --- | --- | --- | ---: | --- |
| na-couv-001 | 2024-04-19 | Gironde | pas_collecte | — | aucune collecte le 2024-04-19 pour France 3 NA — Correze (RSS) |
| na-couv-002 | 2024-05-15 | Pyrénées-Atlantiques | pas_collecte | — | aucune collecte le 2024-05-15 pour Sud Ouest Éco (RSS) |
| na-couv-003 | 2024-06-14 | Charente | pas_collecte | — | aucune collecte le 2024-06-14 pour Charente Libre Économie (RSS) |
| na-couv-004 | 2024-07-01 | Charente-Maritime | pas_collecte | — | aucune collecte le 2024-07-01 pour ICI Creuse — a la une (RSS) |
| na-couv-005 | 2024-11-27 | Dordogne | pas_collecte | — | aucune collecte le 2024-11-27 pour Sud Ouest Éco (RSS) |
| na-couv-006 | 2025-02-14 | Corrèze | pas_collecte | — | aucune collecte le 2025-02-14 pour La Depeche — Lot-et-Garonne (RSS) |
| na-couv-007 | 2025-03-01 | Gironde | pas_collecte | — | aucune collecte le 2025-03-01 pour Le Republicain Lot-et-Garonne — actu.fr (RSS) |
| na-couv-008 | 2025-07-11 | Creuse | pas_collecte | — | aucune collecte le 2025-07-11 pour France 3 NA — Correze (RSS) |
| na-couv-009 | 2025-09-05 | Vienne | pas_collecte | — | aucune collecte le 2025-09-05 pour Ouest-France (RSS) |
| na-couv-010 | 2025-10-03 | Lot-et-Garonne | pas_collecte | — | aucune collecte le 2025-10-03 pour France 3 NA — Correze (RSS) |
| na-couv-011 | 2025-11-27 | Charente-Maritime | pas_collecte | — | aucune collecte le 2025-11-27 pour Sud Ouest Éco (RSS) |
| na-couv-012 | 2025-12-11 | Deux-Sèvres | pas_collecte | — | aucune collecte le 2025-12-11 pour ICI Creuse — a la une (RSS) |
| na-couv-013 | 2026-01-22 | Charente | pas_collecte | — | média absent de la table source |
| na-couv-014 | 2026-03-02 | Gironde | pas_collecte | — | média absent de la table source |
| na-couv-015 | 2026-03-15 | Vienne | pas_collecte | — | aucune collecte le 2026-03-15 pour La Nouvelle République — Deux-Sèvres (RSS) |
| na-couv-016 | 2026-04-09 | Gironde | pas_collecte | — | aucune collecte le 2026-04-09 pour Sud Ouest Éco (RSS) |
| na-couv-017 | 2026-05-13 | Gironde | pas_collecte | — | aucune collecte le 2026-05-13 pour Sud Ouest Éco (RSS) |
| na-couv-018 | 2026-06-29 | Haute-Vienne | pas_collecte | — | média absent de la table source |
| na-couv-019 | 2026-08-28 | Landes | pas_collecte | — | média absent de la table source |
| na-couv-020 | 2026-09-15 | Gironde | pas_collecte | — | média absent de la table source |

Le JSON publié contient, pour chaque ligne, les trois requêtes SQL exécutées,
leurs paramètres, les sources examinées et les événements éventuellement
correspondants (`incidents[].requetes`).

## Méthode

1. **Consolidation.** `scripts/consolider-corpus-couverture.mts` lit les
   `bench/couverture/*.jsonl`, valide les champs obligatoires, déduplique par
   `id` et trie par `id`. Le SHA-256 porte sur les lignes JSON resérialisées,
   triées, terminées par `\n`. Pour un seul fichier déjà trié, cela équivaut au
   `sha256sum` du fichier source. L'empreinte est écrite dans
   `bench/couverture/HASH` et vérifiée par `--check`.
2. **Correspondance.** Pour chaque incident, `event` et `event_archive` sont
   interrogés par URL normalisée (schéma, `www.`, requête et slash final
   supprimés), par titre normalisé (accent et ponctuation supprimés) le jour de
   publication, ou par organisation normalisée le même jour. Un incident est
   **vu** seulement si un événement correspondant porte un `org_id` non nul.
3. **Motif d'absence**, par priorité : `vu` → `pas_rattache` (événement
   correspondant sans `org_id`) → `pas_juge_cyber` (média collecté ce jour-là
   et `classifyFamily()` renvoie `presse`) → `pas_collecte` (aucune exécution,
   aucun événement ni `last_ok_at` ce jour-là) → `indetermine`.
4. **Délai.** Heures écoulées entre la publication (minuit UTC) et le
   `collected_at` du premier événement correspondant, arrondies au dixième.
   `null` si l'incident n'est pas vu.
5. **Reproductibilité.** Aucun appel réseau, aucune date murale : `dateCalcul`
   est la dernière date de collecte en base. Deux exécutions de suite sur une
   base inchangée produisent des fichiers octet pour octet identiques. Le test
   d'intégration compare la réponse HTTP à un nouveau passage du script.

## Requête de reproduction

```bash
cd /home/jolt/radar-cyber
DATABASE_URL='postgres://radar:radar@localhost:5433/radar' pnpm couverture:corpus
DATABASE_URL='postgres://radar:radar@localhost:5433/radar' pnpm couverture:mesurer
pnpm couverture:verifier
pnpm -r typecheck
cd apps/api && RADAR_TEST_ADMIN_URL='postgres://radar:radar@localhost:5433/postgres' node_modules/.bin/tsx test/run.ts test/couverture-api.test.ts
```

`pnpm couverture:mesurer --stdout` affiche le JSON seul ; `--check` compare la
publication à un nouveau calcul sans écrire. Les trois requêtes exécutées pour
chaque incident (les paramètres sont ceux de `incidents[].requetes` dans le
JSON) :

```sql
-- 1. Un événement correspond-il ? $1=URL normalisée, $2=titre normalisé,
--    $3=organisation normalisée, $4=date de publication.
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
 WHERE (t.source_url IS NOT NULL
        AND regexp_replace(regexp_replace(regexp_replace(lower(t.source_url),
              '^https?://(www\.)?', ''), '[?#].*$', ''), '/+$', '') = d.url)
    OR (t.title IS NOT NULL
        AND trim(regexp_replace(unaccent(lower(t.title)), '[^a-z0-9]+', ' ', 'g')) = d.titre
        AND t.observed_at::date = d.jour)
    OR (t.org_name IS NOT NULL
        AND trim(regexp_replace(unaccent(lower(t.org_name)), '[^a-z0-9]+', ' ', 'g')) = d.org
        AND t.observed_at::date = d.jour)
 ORDER BY t.collected_at ASC LIMIT 100;
```

```sql
-- 2. Le média a-t-il été collecté le jour de publication ?
--    $1=hôte de l'URL, $2=nom du média normalisé, $3=date de publication.
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
 ORDER BY s.id;
```

```sql
-- 3. Qu'a produit la collecte du média autour de cette date ?
--    $1=date de publication, $2=identifiants des sources trouvées en 2.
WITH demande AS (SELECT $1::date AS jour)
SELECT coalesce(e.family, '(aucune)') AS famille, count(*)::int AS evenements
  FROM event e CROSS JOIN demande d
 WHERE e.source_id = ANY($2::text[])
   AND e.collected_at::date BETWEEN d.jour - INTERVAL '7 days' AND d.jour + INTERVAL '7 days'
 GROUP BY 1 ORDER BY 2 DESC, 1;
```

Contrôle rapide sur le premier incident, sans paramètres :

```bash
psql 'postgres://radar:radar@localhost:5433/radar' -c \
  "SELECT count(*) FROM event WHERE lower(source_url) LIKE '%floirac%';"
# 0
```

## Ce que ce chiffre ne dit pas

- **Il ne mesure pas l'exhaustivité.** Les 20 lignes sont un échantillon
  vérifié une par une, pas l'ensemble des incidents publics de la région. Le
  taux décrit ce jeu de 20 faits, rien d'autre.
- **« Pas collecté » ne signifie pas « jamais vu ».** L'historique de
  `collector_run` ne couvre que le 13 au 21 novembre 2026, alors que les
  publications vont d'avril 2024 à septembre 2026. Le motif constate l'absence
  de preuve de collecte le jour de publication ; la recherche d'événements
  correspondants dans les 26 719 événements et 4 710 archives n'a également
  rien trouvé, mais une correspondance par paraphrase échapperait à la règle
  d'URL/titre/organisation normalisés.
- **Aucun délai n'est mesurable.** Le délai médian est `null`, pas zéro.
  Publier « 0 h » laisserait croire à une collecte instantanée.
- **Le chiffre est une photographie.** Il est lié à l'empreinte du corpus et à
  l'état de la base ci-dessus. Ajouter un incident au corpus, collecter l'un
  d'eux ou modifier la table `source` change le résultat : il faut alors
  republier le rapport, pas adapter la prose.
- **Il ne juge ni la qualité du rattachement ni la pertinence des autres
  flux.** Les 26 719 événements comprennent surtout des CVE et des revendications
  extérieures à la Nouvelle-Aquitaine ; un taux régional différent demanderait
  un autre corpus et une autre mesure.
- **Il n'est pas comparable au 66,7 % publié précédemment.** Ce dernier venait
  d'un autre corpus (60 incidents, 42 dans une fenêtre glissante) rejoué à
  travers la porte d'admission ; ce rapport-ci mesure 20 incidents datés de
  2024 à 2026 directement contre `event`, `event_archive` et `collector_run`.
- **Il ne dit rien des incidents non publics** : victimes qui ne communiquent
  pas, faits sans article accessible, ou événements dont la source est derrière
  un paywall et jamais collectée.
