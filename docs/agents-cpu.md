# Agents CPU — fausses alertes sur la base 5433

Mesure du **21 novembre 2026** sur la base réelle `localhost:5433/radar` :
27 rejeux du 2025-11-21 au 2026-11-21 (pas de 14 j), avec lecture des faits
cités par chaque alerte (titre, organisation, date) — pas seulement le test
« incident dans le corpus ». Une alerte est fausse quand rien derrière ne
concerne l'organisation ; elle est non classable quand le fait peut être un
incident réel après la fin de couverture du corpus (10 novembre).

| Agent | Alertes produites | Fausses à la lecture |
| --- | ---: | ---: |
| `nouvelle-organisation` | 0 | 0 |
| `rafale` | 3 | 3 |
| `changement-nature` | 3 | 2 |

La troisième alerte `changement-nature` (axiscades.com, revendication
incransom du 12 novembre) est **non classable** et n'est donc pas comptée
fausse. Les trois rafales sont des avis ou dépêches sans incident pour
l'organisation visée (COP31, documentaire et notes ANSSI ; bulletins NGINX
en plusieurs langues) : le détecteur attribue l'alerte au premier fait, pas
à une organisation touchée. Les deux autres `changement-nature` sont fausses
(revendication sur une organisation sans rapport, revendication lockbit3
périmée de février 2024).

Instrument : `scripts/mesure-fausses-alertes.mts --depuis=2025-11-21
--jusqua=2026-11-21 --pas=14`. Rejeu et verdicts détaillés :
`/tmp/mesure-fausses-alertes-20261121/rupture-rejeu-2026-11-21.json` et
`check-truth.log`. Le classement du script livré (6/6 fausses) ignorerait la
couverture du corpus ; `nom_normalise`, absent en base, a été recalculé depuis
l'alias dans la copie `/tmp` de l'instrument.
