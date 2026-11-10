# Rapport hebdomadaire

`scripts/weekly-report.mts` produit en lecture seule un rapport agrégé sur les
événements, alertes, organisations et la quarantaine. Chaque requête est bornée
par la fenêtre demandée et exclut les TLP:RED (stockés `RED` en base).

## Usage (depuis `apps/api`)

```sh
./node_modules/.bin/tsx ../../scripts/weekly-report.mts --days 30
./node_modules/.bin/tsx ../../scripts/weekly-report.mts --days 7 --html --out /tmp/rapport.html
```

Options : `--days N` (défaut 7), `--out FICHIER` (sinon stdout), `--html`
(page autonome, styles inline, `@media print` noir et blanc, zéro ressource
externe), `--help`.

## Contenu
Synthèse (5 lignes max), événements par famille, top 10 départements, dix
événements marquants, volumes de quarantaine, couverture des organisations. Aucune ressource externe : le HTML s'imprime hors ligne.
