# Registre des absences — attestations négatives signées

## Le trou que ce registre bouche

Le radar ne consignait que le positif : « voici un incident rattaché à cette
organisation ». Une organisation absente des écrans pouvait donc aussi bien
n'avoir rien subi que **ne pas avoir été couverte**. Le négatif n'était pas
auditable.

`negative_attestation` consigne l'absence explicitement : pour une
organisation, une fenêtre et un ensemble de sources actives, aucun événement
rattaché n'a été observé. Chaque ligne est scellée.

## Portée exacte — à ne jamais élargir

- L'absence porte sur le magasin `event` du radar, **pas sur le monde**.
  `events_found = 0` signifie « aucun événement rattaché à cette organisation
  dans la fenêtre », jamais « rien ne s'est produit ».
- `sources_checked` compte les sources `enabled` incluses dans le périmètre de
  la requête au moment de la génération. `source_digest` est le SHA-256 de
  leurs identifiants triés : l'ensemble exact contrôlé est rejouable.
- Une source nationale (NVD, CERT-FR national, etc.) n'est jamais présentée
  comme locale : `source_scope` vaut `enabled-sources`, sans prétention
  régionale.
- Aucune donnée personnelle : nom public d'organisation, code officiel
  (SIREN/FINESS/UAI/INSEE), fenêtre, compteurs, empreintes.

## Sceau

`signed = true` exige une signature et une méthode. Deux niveaux, dits
explicitement dans `signature_method` :

| méthode | ce qu'elle prouve | clé |
|---|---|---|
| `hmac-sha256` | authenticité + intégrité | `RADAR_ATTESTATION_KEY` |
| `sha256-content` | intégrité seule, rejouable par quiconque | aucune |

Le contenu canonique (`apps/api/src/attestations/negative.ts`) porte
l'organisation, la fenêtre, les sources et la méthode. Toute modification
ultérieure d'une ligne fait échouer la vérification. Un sceau HMAC n'est
vérifiable que par une instance qui détient la même clé ; l'API renvoie alors
`signatureValid: null`, jamais `false` par défaut.

## Générer et vérifier

```bash
# mesure sans écriture (fenêtre par défaut : 30 jours pleins, fin à hier 00:00 UTC)
DATABASE_URL=… apps/api/node_modules/.bin/tsx scripts/attestations-negatives.mts

# écriture
DATABASE_URL=… apps/api/node_modules/.bin/tsx scripts/attestations-negatives.mts --apply

# fenêtre explicite, borne de fin exclue
… --apply --window-start=2026-10-23 --window-end=2026-11-22

# rapport JSON reproductible
… --apply --json=bench/results/attestations-negatives.json
```

`pnpm setup` exécute la génération après le chargement du référentiel ;
`pnpm setup:check` échoue si le registre descend sous 1 000 attestations
signées multi-sources.

Le générateur refuse d'écrire si moins de **trois** sources actives sont
interrogées : une absence assise sur une ou deux sources est un angle mort
déguisé en preuve.

## Critère de sortie

```sql
SELECT count(*) FROM negative_attestation
WHERE sources_checked >= 3 AND signed = true AND window_end > window_start;
```

Cible : `>= 1000`. Le test `apps/api/test/negative-attestations.test.ts`
l'exécute sur une base fraîche après avoir créé 1 001 organisations dont une
seule porte un événement dans la fenêtre.


## Mesure de référence — 23 novembre 2026

Le registre livré par la PR #653 portait 4 462 attestations sur sa base de
référence. Sur la base de dev au 23/11, ses 1 000 lignes étaient encore des
lignes `historique` (empreintes non calculées) : zéro attestation réellement
générée par le chantier. Deux migrations de reprise ont été nécessaires avant
toute écriture : `migrate-229` remplace la clé d'unicité historique
`(org_id, window_start, window_end)` par celle attendue du générateur
`(org_slug, window_start, window_end, method)` ; `migrate-230` rend `source_ids`
nullable, cette colonne n'étant plus alimentée depuis que le jeu exact des
sources est scellé dans `source_digest`.

Génération rejouée sur la base de dev (fenêtre explicite, 3 038 sources
actives, sceau `sha256-content`) :

```bash
DATABASE_URL=… apps/api/node_modules/.bin/tsx scripts/attestations-negatives.mts \
  --apply --window-start=2026-10-23 --window-end=2026-11-22 --limit=5000 \
  --json=bench/results/attestations-negatives.json
```

Mesure reproductible, sans écriture :

```bash
psql "$DATABASE_URL" -tAc "
SELECT count(*) FROM negative_attestation
WHERE sources_checked >= 3 AND signed = true AND window_end > window_start
  AND signature_method IN ('hmac-sha256', 'sha256-content')
  AND source_digest NOT IN ('historique-non-calcule', 'historique');
"
```

Résultat mesuré : **5 000** attestations générées et scellées, **5 000**
organisations distinctes ; le critère public du rapport compte **6 000** lignes
en ajoutant les 1 000 attestations historiques. Détail dans
`bench/results/attestations-negatives.json`.


## Lecture publique

`GET /api/attestations-negatives?limit=100&orgId=…&from=…&to=…` — lecture
anonyme, triée par fenêtre décroissante. La réponse répète la portée et donne
`signatureValid` quand le sceau est vérifiable localement, ainsi que
`stillAbsent`, recalculé à la lecture : une attestation démentie par un
événement arrivé plus tard reste visible, mais marquée périmée.

## Limites assumées

- Un événement sans `org_id` (non rattaché, homonyme, établissement parent)
  ne bloque pas l'attestation : le périmètre est le rattachement, pas la
  mention.
- Une source en panne de collecte ressemble à une absence. `sources_checked`
  et `source_digest` disent ce qui a été interrogé, pas si la collecte était
  fraîche ; la fraîcheur se lit dans `source.last_ok_at`.
- Le registre atteste une fenêtre, pas une période continue : deux fenêtres
  disjointes ne composent pas une preuve sur l'intervalle.

OBJECTIF : atteint — 5 000 / 1 000
