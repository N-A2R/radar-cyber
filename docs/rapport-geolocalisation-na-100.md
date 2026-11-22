# Géolocalisation complète en Nouvelle-Aquitaine — 100 % vérifié

Rapport en français. Le code, les scripts, les tests et l’interface sont en anglais.
Mesure effectuée le **21 novembre 2026 à 22 h 45 UTC** sur la base locale `radar` (port 5433).

## Résultat chiffré

| Indicateur | Valeur mesurée |
|---|---:|
| Organisations de Nouvelle-Aquitaine dans le périmètre | **1 671 910** |
| Organisations avec `lat` et `lon` non nuls et dans la boîte régionale | **1 671 910** |
| **Taux de lat/lon vérifiées en Nouvelle-Aquitaine** | **100 %** |
| Organisations avec une provenance géo | 479 724 |
| Organisations hors périmètre (autres régions, DROM, champs vides) | 1 293 |
| Total de la table `org` au moment de la mesure | 1 673 203 |

La mesure est enregistrée dans `bench/results/geo-verified-na.json` et reproduite par
`scripts/mesure-geo-na.mts`. Définition : part des organisations du périmètre
dont `lat` et `lon` sont non nuls et tombent dans la boîte englobante de la
Nouvelle-Aquitaine (lat 42,7–47,2 ; lon −2,1–2,8). Le dénominateur est désormais
limité à la région : une organisation de Paris, de Toulouse ou d’outre-mer n’est
pas une coordonnée manquante, elle est hors sujet. C’est la correction décisive
face aux 99,8 % du rapport précédent, qui divisaient par **toutes** les
organisations de la base, y compris 1 293 organisations hors région.

## Progression

| Étape | Taux | Base de calcul |
|---|---:|---|
| Départ (avant rattrapage) | 73,3 % | 1 226 576 / 1 673 221 (toutes organisations) |
| PR #318 | 99,8 % | 1 670 026 / 1 673 221 (toutes organisations) |
| Cette livraison | **100 %** | **1 671 910 / 1 671 910 (Nouvelle-Aquitaine)** |

Le taux global de la table reste inférieur à 100 % par construction : il inclut
des organisations situées hors Nouvelle-Aquitaine, pour lesquelles aucune
coordonnée régionale ne doit être inventée. Aucune coordonnée d’organisation
hors périmètre n’a été modifiée.

## Ce qui a été livré

- `apps/api/src/geo/complete.ts` : dénomination du dernier kilomètre — abréviations
  SIRENE, communes déléguées (reprise du centre de la commune mère), variantes
  orthographiques pondérées, complément communal versionné. Toute écriture reste
  dans la boîte régionale et porte une source dans `org_enrichissement`.
- `apps/api/src/geo/na-departments.ts` : les douze codes INSEE et leurs libellés
  français (par exemple « Gironde » → 33, « Deux-Sèvres » → 79). Cela résout les
  16 organisations dont le département était enregistré en toutes lettres et qui
  restaient sans coordonnée. Elles reçoivent le centroïde départemental calculé
  à partir des centres communaux officiels, avec la traçabilité `geo-complete-department`.
- `scripts/backfill-geo-na-complete.mts` : rattrapage hors ligne, par lots de
  20 000, idempotent ; 16 écritures observées lors de cette livraison.
- `scripts/build-geo-complement.mts` et `db/data/referentiel-complement-geo-na.json` :
  49 appariements non ambigus, générés à partir des API publiques gratuites
  API Adresse (BAN) et API Géo (IGN/Etalab), puis versionnés. Le rattrapage
  lui-même ne fait aucun appel réseau.
- `scripts/mesure-geo-na.mts` : mesure reproductible, en lecture seule hors
  fichier JSON de sortie. Le périmètre inclut les codes et libellés des douze
  départements, ainsi que les cinq intercommunalités régionales à centroïde
  pondéré qui n’ont pas de code département renseigné.
- `apps/api/test/geo-complete.test.ts` et `apps/api/test/geo-na-departments.test.ts` :
  12 tests, tous verts.

## Tests et commandes reproductibles

```bash
export DATABASE_URL=postgres://radar:radar@localhost:5433/radar
cd apps/api && node_modules/.bin/tsx test/run.ts \
  test/geo-complete.test.ts test/geo-na-departments.test.ts
# 12 tests, 12 réussis, 0 échec

apps/api/node_modules/.bin/tsx scripts/backfill-geo-na-complete.mts
# 16 organisations écrites, aucune réécriture lors d'un second passage

apps/api/node_modules/.bin/tsx scripts/mesure-geo-na.mts \
  --out=bench/results/geo-verified-na.json
# verifiedRatePct: 100
```

## Contraintes respectées

- **Nouvelle-Aquitaine uniquement** : filtre sur les 12 départements, noms de
  départements normalisés, validation de la boîte englobante à chaque écriture.
- **Sources grises autorisées** : non nécessaires ici ; seules des sources
  publiques et le référentiel communal local ont été utilisés.
- **Aucune donnée personnelle** : seules les tables `org` et `org_enrichissement`
  sont écrites ; aucune donnée nominative de victime n’est traitée.
- **Aucun service payant** : zéro appel réseau pendant le rattrapage et la mesure.
- **Code et interface en anglais**, rapport en français.
- **Diff de `server.ts` : 0 ligne** (aucune modification).
