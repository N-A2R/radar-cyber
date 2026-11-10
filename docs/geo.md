# Géocodage et provenance géographique

Comment une organisation puis un événement obtiennent des coordonnées, d'où
viennent ces coordonnées, et comment les distinguer d'une estimation
d'hébergement. Vérifié le **2026-11-10** (réponses HTTP 200 observées).

## Pipeline

```
org.lat/lon/geo_source           ← scripts/geocode-orgs.mts
        ↓  (org_id)
event.lat/lon/geo_type/geo_source ← geocodePendingEvents (lots de 500)
```

1. `apps/api/src/collectors/geocode.ts` — `geocodeOrgs()` interroge les API
   publiques dans un ordre de repli strict, puis `geocodePendingEvents()`
   recopie la position de l'org sur ses événements sans coordonnées.
2. `scripts/geocode-orgs.mts` — point d'entrée CLI (dry-run, limite, mode
   événements seuls). Il réutilise le module API : une seule implémentation.
3. `db/migrate-008-geo.sql` — colonnes `org.geo_source`, `event.geo_source`
   et index `event(org_id)` s'il n'existe aucun index commençant par cette
   colonne.

Les deux étapes sont idempotentes : relancer ne modifie que les lignes encore
sans coordonnées (`event.lat IS NULL`, `org.geo_source IS NULL`). Une position
marquée `manuel` n'est jamais écrasée, même avec `--force`.

## API publiques utilisées

| Ordre | API | URL | Rôle | Licence | Quota / limite |
|---|---|---|---|---|---|
| 1 | recherche-entreprises | `https://recherche-entreprises.api.gouv.fr/search?q=<nom>&per_page=5` | siège SIRENE : `siege.coordonnees` = `"lat,lon"` | Licence Ouverte 2.0 (Etalab), données INSEE/SIRENE | 7 req/s documenté ; le script plafonne à ~4,5 req/s |
| 2 | BAN / Géoplateforme | `https://data.geopf.fr/geocodage/search/?q=<nom>&limit=5` | adresse ou lieu-dit ; `geometry.coordinates` = `[lon, lat]` | Licence Ouverte 2.0 (BAN/IGN) | 50 req/s (`ratelimit-limit` observé le 2026-11-10) |
| 3 | découpage administratif | `https://geo.api.gouv.fr/communes?nom=<ville>&fields=nom,code,centre,population&limit=5&boost=population[&codeDepartement=<dept>]` | centre de commune ; `centre.coordinates` = `[lon, lat]` | Licence Ouverte 2.0 (Etalab) | pas de quota publié ; usage raisonnable, cache local |

Remarques vérifiées :

- `api-adresse.data.gouv.fr` répond encore mais est **déprécié** (`sunset`
  annoncé au 31 janvier 2026, redirection 301 vers data.geopf.fr). Le code
  utilise donc directement l'endpoint officiel de la Géoplateforme, dont la
  réponse GeoJSON est identique.
- Un `User-Agent` explicite (`RadarCyberNA/0.2 (+https://github.com/j0ltdevv/radar-cyber)`)
  est envoyé à chaque requête ; les API Etalab n'exigent pas de clé.
- Les appels sont sérialisés par une file interne espacée de 220 ms
  (≈ 4,5 req/s), timeout de 8 s, et échouent silencieusement (`null`) pour
  laisser passer le repli suivant.

## Repli et garde-fous

1. **recherche-entreprises** : première correspondance dont le `siege` porte
   des coordonnées exploitables.
2. **BAN** : uniquement des types `housenumber`, `street` ou `locality` avec
   `score >= 0.4`. Les résultats `municipality` sont ignorés : un centre de
   commune n'est pas une adresse, et il est couvert par l'étape 3 avec une
   provenance distincte.
3. **commune-centre** : centre INSEE de `org.city` (filtré par `org.dept`
   quand il est renseigné). Repli grossier mais fiable quand l'entité n'est
   ni une entreprise ni une adresse.

Chaque étape compare les mots distinctifs du nom de l'org (normalisés sans
accents, mots génériques exclus : *région*, *département*, *métropole*,
*centre hospitalier*…) au libellé du candidat. Une correspondance sans mot
commun est rejetée, pour éviter qu'une recherche SIRENE approximative place
une org à l'autre bout de la France.

Limites assumées :

- l'étape 1 renvoie le **siège légal**, pas le site opéré : une société dont
  le siège est à Paris et l'activité à Bordeaux est géocodée à Paris ;
- une org sans `city` et sans correspondance SIRENE/BAN reste sans
  coordonnées (`unresolved` dans le bilan) ;
- le géocodage ne devine jamais une position : pas de centroïde de
  département, pas de coordonnées inventées.

## Provenance (`geo_source`)

| Valeur | Sens |
|---|---|
| `recherche-entreprises` | siège SIRENE (coordonnées déclarées à l'INSEE) |
| `BAN` | adresse ou lieu-dit de la Base Adresse Nationale |
| `commune-centre` | centre de la commune de rattachement (INSEE) |
| `manuel` | saisie humaine ; jamais modifiée par le géocodeur |
| `org` (événements) | coordonnée recopiée depuis `org.lat/lon` |

`event.geo_source` reste `NULL` pour les coordonnées d'origine collecteur
(non tracées) et pour les événements antérieurs à la migration.

## `entity_location` vs `hosting_estimate`

`event.geo_type` qualifie la **nature** de la coordonnée, pas sa précision :

- `entity_location` — position de l'entité visée (siège, site, commune).
  C'est la valeur posée par `geocodePendingEvents` : la coordonnée vient de
  l'org attaquée, pas de l'infrastructure de l'attaquant.
- `hosting_estimate` — position estimée de l'hébergement (IP, ASN, CDN) ;
  désigne l'infrastructure, souvent à l'étranger, et ne doit jamais être
  présentée comme le lieu de l'incident.
- `claimed_origin` — origine revendiquée par un acteur (non vérifiée).
- `unknown` — aucune information géographique exploitable.

La carte ne doit pas mélanger ces familles : une org géocodée au centre de sa
commune reste une localisation d'entité, à ne pas confondre avec la position
d'un serveur compromise.

## Exploitation

```bash
# Contrôle sans écriture (les API sont quand même interrogées)
npx tsx scripts/geocode-orgs.mts --dry-run --limit=30

# Run réel de rodage
npx tsx scripts/geocode-orgs.mts --limit=30

# Run complet (ensemble des organisations, durée variable selon replis)
npx tsx scripts/geocode-orgs.mts

# Uniquement la propagation org → événements
npx tsx scripts/geocode-orgs.mts --events-only

# Réexamen des orgs déjà géocodées (sauf « manuel »)
npx tsx scripts/geocode-orgs.mts --force
```

Contrôle SQL :

```sql
SELECT geo_source, count(*) FROM org GROUP BY geo_source ORDER BY 2 DESC;
SELECT count(*) FROM event WHERE org_id IS NOT NULL AND lat IS NULL;
SELECT geo_source, geo_type, count(*) FROM event GROUP BY 1, 2 ORDER BY 3 DESC;
```

Un événement rattaché à une org déjà géocodée par la corrélation peut avoir
reçu ses coordonnées dans `correlate.ts` (sans `geo_source`) ; seule la
propagation 008 renseigne la provenance `org`.
