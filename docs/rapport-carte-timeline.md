# Rapport — Carte avec timeline (chantier F2)

## Prévol

Recherche effectuée avant toute modification (`gh pr list --state all --search …`,
`git log --oneline --all | grep -i …`) : aucune PR ne porte sur « carte avec
navigation temporelle ». Les PR proches sont `#131`/`#172` (carte hors ligne),
`#251` (timeline horaire de l'écran *Aujourd'hui*) et `#32` (carte regroupée) ;
aucune ne fournit un scrubber temporel sur la carte. Le chantier est donc
implémenté sur `ext/chantier-f2`, issu d'`origin/main`.

## Objectif et mesure

L'objectif est une carte interactive avec navigation temporelle. La mesure est
le nombre d'événements géolocalisés et datés de Nouvelle-Aquitaine que le
scrubber peut réellement parcourir.

Commande reproductible (base locale `pnpm db:up` si nécessaire) :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-map-timeline.mts --write
```

Résultat obtenu le 2026-11-22 (sortie JSON complète :
`bench/results/map-timeline.json`) :

| Mesure | Valeur |
|---|---:|
| Organisations de référence | 1 673 151 |
| Sources | 312 |
| Événements au total | 26 394 |
| **Événements navigables sur la carte, toutes dates** | **6 097** |
| **Événements navigables sur les 12 derniers mois** | **5 809** |
| Mois calendaires contenant des événements | 12 / 12 |
| Mois le plus dense (octobre 2026) | 3 242 événements |
| Première / dernière date | 2015-07-24 / 2026-11-21 |

La fenêtre de 12 mois est celle que le scrubber affiche. Les 6 097 événements
« toutes dates » sont mesurés par la commande ci-dessus et interrogeables via
`bucket=all` (par pages de 2 000) ; l'API borne l'histogramme à 36 mois pour
garder une réponse rapide.

## Ce qui a été livré

- `GET /api/map/timeline/buckets?months=12` : comptages agrégés par mois UTC,
  mois vides conservés côté client pour que la piste de lecture reste continue.
- `GET /api/map/timeline/events?bucket=YYYY-MM|all&limit=…` : points
  géolocalisés du mois choisi (1 000 par défaut, 2 000 au maximum), avec
  `total` et `truncated` explicites — une page partielle n'est jamais montrée
  comme un total.
- Scrubber sur la carte (`MapTimeline.tsx`) : 12 barres cliquables avec
  comptages accessibles, curseur `range`, lecture/pause, retour « All dates ».
  Le changement de mois remplace les points envoyés à `Map3D` ; un mois vide
  affiche 0 événement, sans repli silencieux sur le fil d'actualité.
- Le mode démonstration utilise les mêmes fonctions pures sur les données
  simulées : aucune requête réseau, aucun service payant.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : filtre sur l'enveloppe
  `lat 44–46.6, lon -1.9–1.3` (les polygones de départements sont dessinés côté
  web ; PostGIS n'est pas présent dans la base). Les événements sans
  coordonnées sont exclus.
- **Sources grises autorisées** : aucun filtre de confiance ni de source dans
  la requête ; seules la date et la géométrie sont exigées.
- **Aucune donnée personnelle de victime** : la réponse ne contient ni
  `summary`, ni `evidence`, ni champ d'identification de victime ; seuls
  l'identifiant d'événement, son titre public, sa famille, sa date, sa
  sévérité, sa source et ses coordonnées sont transmis.
- **Aucun service payant** : fond de carte OpenFreeMap/OSM existant, aucune
  clé ni facturation ajoutée.
- **Code et interface en anglais** : nouveaux identifiants, commentaires,
  libellés (`Play`, `All dates`, `… events`) et messages d'erreur en anglais.
  Le rapport reste en français.
- **`server.ts` inchangé** (diff de 0 ligne) : la route est enregistrée dans
  le registre `routes/index.ts` et déclarée dans la matrice d'accès.
- **Aucune commande de plus de 60 s** : mesure 0,4 s, endpoint réel 95 ms,
  tests API 1,6 s et 2,1 s, test web (build SSR inclus) < 10 s.

## Vérification

- `apps/api/test/map-timeline.test.ts` : 4 tests, un par comportement
  (comptage régional, contenu d'un mois, troncature annoncée, entrées invalides)
  — 4/4 verts sur une base de test éphémère.
- `apps/web/test/map-timeline-verif.tsx` : 11 contrôles sur les fonctions
  pures et le rendu (bornes UTC, formats Postgres, libellés, lecture, dernière
  barre, absence de texte français) — 11/11 verts.
- `apps/api/test/securite-couverture.test.ts` : 3/3 verts, les deux nouvelles
  routes ayant une décision d'accès explicite.
- Contrôle sur la base réelle : 12 buckets / 5 809 événements, page de
  novembre = 2 494 événements dont 5 renvoyés avec `truncated: true`.
- Surface vérifiée dans un navigateur réel sur `http://127.0.0.1:4187/#/map`
  (mode démonstration) : scrubber visible au-dessus du canvas, 12 barres,
  sélection d'un mois, lecture automatique, libellé « 0 events » sur un mois
  vide.
- Typecheck web et API : aucune nouvelle erreur ; une erreur préexistante
  subsiste dans `Map3D.tsx:680` (type `DepFeature.geometry` en `unknown`).
