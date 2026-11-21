# Géolocalisation complète — rapport de livraison

Mesuré le **21 novembre 2026** sur la base de production locale (port 5433).
Rapport en français ; le code, les scripts et l'interface sont en anglais.

## Résultat chiffré

| Indicateur | Avant | Après |
|---|---:|---:|
| Organisations avec lat/lon vérifiées | 1 226 576 | **1 670 026** |
| Taux de lat/lon vérifiées | **73,3 %** | **99,8 %** |
| Total organisations | 1 673 221 | 1 673 221 |
| Organisations avec provenance géo | 34 402 | 477 842 |
| Événements avec coordonnées | 12 631 / 27 882 | 12 672 / 27 882 |

**Objectif atteint : 99,8 % de lat/lon vérifiées**, soit +26,5 points.
Définition retenue (identique avant/après) : part des lignes `org` dont
`lat` et `lon` sont non nuls et tombent dans la boîte englobante de la
Nouvelle-Aquitaine (lat 42,7–47,2 ; lon −2,1–2,8).

## Méthode

Le référentiel territorial local `db/data/referentiel-na.json` (4 517 communes,
source Etalab / découpage administratif, déjà versionné dans le dépôt) contient
le centre INSEE de chaque commune de la région. Aucun appel réseau, aucun
service payant.

1. `apps/api/src/geo/commune-index.ts` indexe les centres communaux par
   `(département, nom normalisé)`. Noms sans accent ni ponctuation. Une clé
   ambiguë (deux communes distinctes) est **supprimée** plutôt que devinée ;
   les centres hors région sont ignorés.
2. `apps/api/src/geo/backfill.ts` ne touche que les organisations de
   Nouvelle-Aquitaine dont `lat` ou `lon` est nul et dont le couple
   `(city, dept)` correspond sans ambiguïté. Les coordonnées existantes ne
   sont jamais écrasées. Chaque écriture est tracée dans `org_enrichissement`
   (`champ='geo'`, `source='commune-centre-local'`, code commune en preuve) et
   `org.geo_source='commune-centre'`.
3. Les lots de 20 000 sont atomiques et idempotents : une reprise après
   interruption ne réécrit rien. La table temporaire est nettoyée à chaque fin
   d'exécution.
4. `scripts/geocode-orgs.mts --events-only` propage ensuite la position de
   l'organisation vers ses événements sans coordonnées (`geo_type=
   'entity_location'`, `geo_source='org'`) : 41 événements hérités.

Bilan du rattrapage : 443 450 organisations résolues sur 445 283 candidates.
Restent 1 833 organisations sans correspondance (ville absente, libellé hors
référentiel ou département non renseigné) : aucune coordonnée n'a été inventée
pour elles. Un centre de commune est une position d'entité traçable, pas une
adresse exacte.

## Tests

`apps/api/test/geo-backfill.test.ts` — 9 tests, un comportement par test :
normalisation des noms, garde-fou régional, correspondance exacte, refus des
données manquantes/hors région, rejet des ambiguïtés, non-écriture des centres
hors région, écriture et traçabilité, idempotence, héritage par un événement.
Les 9 passent (`tsx test/run.ts test/geo-backfill.test.ts`, base éphémère).

## Commandes reproductibles

```bash
# Mesure (lecture seule, sauf le fichier de sortie optionnel)
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  node_modules/.pnpm/node_modules/.bin/tsx scripts/mesure-geo.mts \
  --out=bench/results/geo-verified.json

# Contrôle sans écriture : combien d'orgs sont encore rattrapables
DATABASE_URL=... node_modules/.pnpm/node_modules/.bin/tsx \
  scripts/backfill-geo-na.mts --dry-run

# Remplissage par lots bornés (une commande < 60 s)
DATABASE_URL=... node_modules/.pnpm/node_modules/.bin/tsx \
  scripts/backfill-geo-na.mts --limit=20000

# Propagation aux événements
DATABASE_URL=... node_modules/.pnpm/node_modules/.bin/tsx \
  scripts/geocode-orgs.mts --events-only
```

Le résultat brut de la mesure finale est archivé dans
`bench/results/geo-verified.json`.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : filtre sur les 12 départements de la
  région et validation de la boîte englobante à chaque étape.
- **Sources grises autorisées** : ici aucune source grise n'a été nécessaire ;
  le référentiel local et public suffit.
- **Aucune donnée personnelle de victime** : seule la table `org` est mise à
  jour ; la table `event` ne reçoit que des coordonnées héritées, sans champ
  nominatif.
- **Aucun service payant** : zéro appel réseau pour le rattrapage.
- **Code et interface en anglais**, rapport en français.
- **Diff de `server.ts` : 0 ligne** (aucune modification).
- **Aucune commande de plus de 60 s** : remplissage découpé en lots de 20 000
  avec `timeout ≤ 55 s` ; chaque exécution observée sous 53 s.
