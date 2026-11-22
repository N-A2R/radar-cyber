# Chantier F9 — Design system documenté

## Objectif

Un Storybook qui documente **tous les composants** de l'interface web, mesurable par une commande reproductible.

## État réel de départ

La base locale de travail a été mesurée le 2026-11-22 (port 5433) :

```
PGPASSWORD=radar psql -h localhost -p 5433 -U radar -d radar -Atc \
  "SELECT (SELECT count(*) FROM org), (SELECT count(*) FROM source), (SELECT count(*) FROM event);"
1673151|312|26394
```

Soit **1 673 151 organisations**, **312 sources** et **26 394 événements** — l'ordre de grandeur des « ~28 000 événements » de la consigne. Ce sont des compteurs live, pas des valeurs recopiées du brief ; la mesure est rejouée à chaque exécution du script ci-dessous.

## Commande reproductible et chiffre obtenu

```
cd apps/web && node scripts/measure-storybook.mjs
```

Sortie obtenue :

```json
{
  "components": 40,
  "documented": 40,
  "coveragePercent": 100,
  "storyFiles": 33,
  "stories": 77,
  "missing": [],
  "baseline": {
    "organisations": 1673151,
    "sources": 312,
    "events": 26394
  }
}
```

**Chiffre livré : 40 composants documentés sur 40, soit 100 % de couverture Storybook** (33 fichiers de stories, 77 stories, 33 entrées de catalogue distinctes).

La commande échoue volontairement (`exit 1`) si un composant exporté n'est pas rendu dans une story. Si PostgreSQL n'est pas joignable, elle retombe sur `bench/results/couverture-mesuree.json` et l'indique dans le champ `baseline.source`.

## Livrables

- Storybook 10.6.8 avec `@storybook/react-vite` et `@storybook/react`, configuration dans `apps/web/.storybook/` ; télémétrie désactivée, aucun service payant.
- Une story par module de composant (33 modules : écrans, vues, contrôles, graphe, carte, états partagés), avec au minimum un état peuplé et, quand le composant le permet, les états vide / chargement / erreur.
- Les fonctions de rendu exportées (`renduCorroboration`, `renduHistorique`, `renduRattachement`) sont documentées comme les autres composants.
- Fixtures synthétiques dans `apps/web/src/storybook/fixtures.ts` : départements de Nouvelle-Aquitaine uniquement, sources grises autorisées, aucune donnée personnelle de victime.
- `apps/web/scripts/storybook-inventory.mjs` (inventaire des composants exportés et détection de leur rendu dans les stories) et `apps/web/scripts/measure-storybook.mjs` (mesure affichée ci-dessus).
- `apps/web/test/storybook-coverage.test.tsx` : un test par comportement, dont un test par composant (40) et quatre tests de périmètre ; **44 tests réussis** :
  `cd apps/web && ./node_modules/.bin/vitest run test/storybook-coverage.test.tsx --environment jsdom`
- Vérification de production : `cd apps/web && ./node_modules/.bin/storybook build --quiet --output-dir storybook-static` réussi, 77 stories dans `storybook-static/index.json`.
- `pnpm -F @radar/web typecheck` (équivalent local `./node_modules/.bin/tsc --noEmit`) : aucune erreur.

## Contraintes

- Nouvelle-Aquitaine uniquement dans les jeux de données de documentation (codes département 16 à 87 de la région) ; aucun département hors région.
- Sources grises autorisées et documentées telles quelles dans le registre.
- Aucune donnée personnelle de victime ; les fixtures sont entièrement inventées.
- Aucun service payant : paquets open source, PostgreSQL local.
- Code et interface Storybook en anglais ; le présent rapport est en français.
- `apps/api/src/server.ts` : **0 ligne modifiée**.
- Toutes les commandes exécutées sont restées sous la limite de 60 s (installation incluse : 39,6 s).
