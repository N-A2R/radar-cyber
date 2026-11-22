# Score d'assurance par organisation — Nouvelle-Aquitaine

## Résultat mesuré

**OBJECTIF ATTEINT : un score comparable et auditable couvre 1 671 907 organisations sur 1 671 907 organisations de Nouvelle-Aquitaine, soit 100 %.**

Le score est publié en version `1.0.0`, sur une échelle unique de 0 à 100. La mesure complète est reproductible avec `pnpm measure:insurance-score` (33 s observées) et son résultat brut est versionné dans `bench/results/insurance-score.json`. Son empreinte SHA-256 est :

```
d8d6f1fb06cb8dbafa439e215f85f286916733ac7ce858689b276efe0af93b27
```

L'empreinte porte sur les 582 groupes d'entrées, la date de référence et la version du score ; elle est donc stable d'une exécution à l'autre sur une base inchangée.

## État de départ réellement lu en base

| Grandeur | Valeur mesurée le 2026-11-22 |
| --- | ---: |
| Organisations (base entière) | 1 673 151 |
| Organisations des 12 départements NA | 1 671 907 |
| Sources du catalogue | 315 (214 actives) |
| Événements | 26 240 |
| Événements rattachés à une organisation | 108 |
| Organisations avec au moins un événement | 43 |
| Date de référence (dernier jour observé) | 2026-11-22 |

Les douze départements retenus sont les départements déjà utilisés par le moteur régional : 16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86 et 87. L'énoncé citait 312 sources et « ~28 000 événements » : ce sont des relevés antérieurs. La mesure porte sur la base réellement présente, sans arrondi destiné à coller à l'énoncé.

## Méthodologie écrite

Le score est calculé de la même manière pour chaque organisation de la région. Plus le score est élevé, plus le profil d'assurance est solide et documenté. La formule est publiée telle quelle par `GET /api/insurance/methodology` et implémentée dans `apps/api/src/insurance/score.ts`.

| Composante | Poids | Règle |
| --- | ---: | --- |
| `recordIntegrity` | 20 | 5 points par champ présent parmi SIREN, NAF, coordonnées, identifiant de registre |
| `workforceTransparency` | 10 | `min(10, 2,5 × log10(1 + effectif))` ; 0 si l'effectif n'est pas publié |
| `incidentFreeHistory` | 35 | `35 − min(35, 20 × incidents + 3 × max(0, sévérité − 2))` |
| `ambientPressure` | 15 | `15 − min(15, 5 × signaux d'ambiance)` |
| `evidenceBreadth` | 10 | `min(10, 3 × identifiants de sources distincts)` |

Précisions nécessaires à la reproductibilité :

- **Fenêtre** : 24 mois avant la date de référence, c'est-à-dire le dernier jour observé du corpus local (2026-11-22 ici). Aucune date « aujourd'hui » n'est utilisée dans le calcul.
- **Taux sectoriel** : `(revendications du secteur + 1 000 × taux régional) / (organisations du secteur + 1 000)`. Ce lissage empirical Bayes évite qu'un secteur de petite taille soit pénalisé pour un seul incident. Le taux régional est calculé sur les 1 671 907 organisations NA, y compris lorsque l'API ne note qu'une seule organisation.
- **Bandes comparables** : A (80–100), B (60–79,9), C (40–59,9), D (0–39,9). Les mêmes bornes s'appliquent à toutes les organisations.
- **Sources grises** : toutes les sources locales sont admises, sans filtre de confiance ni de pertinence ; seuls leurs identifiants sont conservés dans la trace d'audit.
- **Données exclues** : titres, résumés, charge utile `evidence`, URL de sources et toute donnée personnelle de victime ne sont jamais lus par le calcul ni renvoyés par l'API. Aucun service payant n'est appelé.

## Distribution observée

| Bande | Organisations |
| --- | ---: |
| D (0–39,9) | 0 |
| C (40–59,9) | 22 |
| B (60–79,9) | 1 522 484 |
| A (80–100) | 149 401 |
| **Total** | **1 671 907** |

Moyennes des composantes sur la population : intégrité 18,37/20, effectif 0,15/10, historique sans incident 35,00/35, pression d'ambiance 15,00/15, position sectorielle 5,48/10, étendue des preuves 0,00/10. Vingt-et-une organisations portent un incident observé, 43 portent au moins une preuve datée, provenant de 22 identifiants de sources distincts.

## Audit et vérification

- `pnpm measure:insurance-score` relit la base, recalcule les 582 groupes d'entrées et réécrit le résultat brut avec son empreinte (~33 s observées).
- `pnpm test:insurance` exécute 23 tests, un comportement par test, sur un schéma temporaire isolé (~32 s observées) : 17 tests de la formule (bornes, plafonds, bandes, déterminisme, sanitisation des entrées) et 6 tests de la lecture en base (périmètre NA uniquement, sources grises conservées, référentiel sectoriel régional, identifiants de sources, organisation hors région sans score).
- `GET /api/insurance/organisations/:id` renvoie le score, les six composantes avec leur raison arithmétique, les compteurs numériques et les identifiants de sources ; c'est la fiche d'audit d'une organisation. `GET /api/insurance/methodology` renvoie la formule et sa version.
- Le diff de `apps/api/src/server.ts` est de **0 ligne** : les routes sont enregistrées dans le registre unique `apps/api/src/routes/index.ts` et dans la matrice d'accès `apps/api/src/security/rbac.ts`.

## Limites assumées

Le score décrit une exposition observée et une qualité de dossier public ; il ne prédit pas une compromission et ne déclenche aucune décision automatisée. Les champs statiques du registre dominent la note : l'effectif n'est publié que pour une minorité d'organisations et seules 43 organisations portent un événement, si bien que les composantes d'incident et de preuves concernent une fraction très faible de la population. Le lissage sectoriel à 1 000 organisations est un choix déclaré, modifiable en une seule constante et versionné avec le score. Aucune donnée personnelle de victime, aucune source payante et aucun service payant n'ont été utilisés.
