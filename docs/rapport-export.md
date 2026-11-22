# Rapport — chantier F5 : export PDF et CSV

Branche : `ext/chantier-f5` (depuis `origin/main`). Date : 22 novembre 2026.

## Résultat chiffré

**Export disponible sur 13/13 écrans, soit 26/26 paires écran × format (CSV et PDF).**

Mesure reproductible :

```bash
pnpm -F @radar/web test:export
```

Sortie observée (le test monte l'application sur les 13 hashes d'écran et vérifie,
pour chacun, la présence de deux boutons actifs dans le groupe « Export current screen ») :

```text
EXPORT_COVERAGE=13/13 screens
EXPORT_FORMATS=26/26 screen-format pairs
Test Files  1 passed (1)
     Tests  9 passed (9)
```

Les 13 écrans mesurés sont : Today, Coverage, Review, Journal, Corpus, Sources,
Map, Directory, Graph, Health, Alerts, Dossier et Nouvelle-Aquitaine.

## État de départ mesuré

La base réelle a été interrogée avant toute modification (PostgreSQL local du
worktree, port 5433) :

```bash
PGURL='postgres://radar:radar@127.0.0.1:5433/radar'
psql "$PGURL" -Atc 'select count(*) from org'          # 1673151
psql "$PGURL" -Atc 'select count(*) from source'       # 312
psql "$PGURL" -Atc 'select count(*) from event'        # 26394
psql "$PGURL" -Atc 'select count(*) from v_event_all'  # 31104 (archives comprises)
```

Soit 1 673 151 organisations, 312 sources et 26 394 événements courants
(31 104 avec les archives), cohérents avec l'ordre de grandeur du chantier.

## Ce qui a été livré

- Un seul contrôle « Export » dans le rail du shell, donc visible sur chaque
  écran, avec deux boutons **CSV** et **PDF** (`apps/web/src/components/ExportMenu.tsx`).
- Chaque écran publie ses propres lignes via `useScreenExport` : les huit écrans
  dont les données appartiennent au shell le font dans `App.tsx`, les cinq autres
  (Directory, Review, Journal, Alerts, Dossier) le font dans leur composant.
  L'export contient donc les données réellement affichées, pas un plateau générique.
- CSV : en-têtes anglais, échappement des guillemets, virgules et retours à la ligne.
- PDF : générateur PDF 1.4 local (`apps/web/src/export.ts`), paginé, sans police
  externe ni service en ligne ; le titre de l'écran et les lignes y figurent.
- Le téléchargement passe par un `Blob` et un nom de fichier daté, ce qui permet
  d'exporter depuis un écran administré sans mettre le jeton dans une URL.

## Contraintes

| Contrainte | Vérification |
| --- | --- |
| Nouvelle-Aquitaine uniquement | Filtre sur les 12 départements (16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 85, 86) dans `prepareRows` ; test dédié avec une ligne du 75 rejetée. |
| Sources grises autorisées | Aucun filtre de fiabilité ; test dédié avec une source `unverified` conservée. |
| Aucune donnée personnelle de victime | Liste blanche de colonnes par écran : ni table de victimes, ni `evidence`, ni `preuve`, ni texte libre brut. Les identifiants directs (e-mail, téléphone, SSN, IBAN, IP) sont en plus neutralisés dans les valeurs ; test dédié. |
| Aucun service payant | CSV et PDF générés dans le navigateur, aucune dépendance ajoutée, aucun appel réseau d'export. |
| Code et interface en anglais | Nouveaux modules, libellés et messages en anglais. |
| Diff de `server.ts` ≤ 10 lignes | `apps/api/src/server.ts` inchangé : **0 ligne** de diff. |
| Aucune commande > 60 s | Mesure principale en ~3 s ; navigation en ~3 s ; build front en ~3 s. |

## Tests

Neuf tests, un par comportement, dans `apps/web/test/export.test.tsx` :
présence des deux formats sur les 13 écrans, liste blanche de colonnes, filtre
régional, conservation des sources grises, neutralisation des identifiants,
échappement CSV, validité et pagination du PDF, téléchargement CSV, téléchargement
PDF. Vérifications complémentaires exécutées : `test:navigation` (4/4) et
`pnpm -F @radar/web build` (succès). Le typecheck signale uniquement une erreur
préexistante dans `apps/web/src/map/Map3D.tsx:680`, fichier non modifié.

## Périmètre

Le bouton exporte les données chargées par l'écran courant (page affichée pour
l'annuaire, filtre appliqué pour le journal, etc.), jamais un vidage de la base :
les 1,67 million d'organisations restent derrière l'API paginée. Aucune donnée
de victime n'entre dans le pipeline d'export.

OBJECTIF : atteint — 13 / 13 écrans (26 / 26 paires écran × format, mesure reproductible : `pnpm -F @radar/web test:export`).
