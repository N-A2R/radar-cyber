# Score de risque par organisation — Nouvelle-Aquitaine

## Résultat mesuré

OBJECTIF : atteint — AUC 0,537083 publiée avec une courbe ROC de 36 points / courbe ROC et AUC publiées.

Le score 0-100 est calculé pour les **1 671 906 organisations** de Nouvelle-Aquitaine présentes dans la base réelle. La mesure est reproductible avec `pnpm mesure:risk` (2,3 s observées) et son résultat brut est versionné dans `bench/results/organisation-risk.json`.

## État de départ observé

| Grandeur | Valeur lue en base |
| --- | ---: |
| Organisations (toutes) | 1 673 220 |
| Organisations NA (12 départements) | 1 671 906 |
| Événements | 27 899 |
| Sources | 463 (362 actives) |
| Revendications de fuite marquées NA | 78 |

Les 12 départements retenus sont ceux déjà utilisés par le moteur NA : 16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87. Les 312 sources annoncées correspondent à un instanté antérieur ; la base lue en contient 463, dont 362 actives. Aucun chiffre n'a été fabriqué pour coller à l'énoncé.

## Méthode

- **Étiquette** : organisation avec au moins une revendication observée, soit `leak_claim.na = true AND org_id IS NOT NULL`, soit `event.assertion_type = 'third_party_claim'`. Aucun nom de victime, titre, résumé ou texte libre n'est lu.
- **Cohorte** : 92 organisations étiquetées 1 et 1 681 organisations étiquetées 0, tirées de façon déterministe (`id % 997 = 7`) parmi les organisations NA sans incident observé.
- **Signaux** : agrégats numériques publics uniquement — événements d'ambiance, nombre de sources distinctes, sévérité maximale, ancienneté, présence d'un domaine/site public et cinq indicateurs de secteur. Les événements de famille `ransomware`/`leaks` et les revendications sont exclus des signaux : ils servent uniquement à poser l'étiquette. Les sources grises sont admises au même titre que les autres sources publiques.
- **Modèle** : régression logistique ridge (25 itérations de Newton, pénalité 0,5) ajustée sur la cohorte, puis intercept recentré sur l'incidence réelle de la population NA. Les scores sont calculés **hors pli** (5 plis déterministes) : aucune organisation ne participe au modèle qui la note.
- **Score 0-100** : 0 correspond au niveau de base de la population, 100 au 75e percentile de l'excès de log-odds observé chez les incidents. La probabilité calibrée reste exposée séparément dans l'API.
- **ROC/AUC** : un point par score distinct, de (0,0) à (1,1). L'AUC de Mann-Whitney (0,537083) est égale à l'aire trapèze de la courbe à 10⁻⁹ près ; cette égalité est vérifiée par la mesure et par un test.

| Seuil de probabilité | TFP | TPR |
| ---: | ---: | ---: |
| — (départ) | 0,000 | 0,000 |
| 0,000157 | 0,120 | 0,152 |
| 0,000096 | 0,406 | 0,457 |
| 0,000083 | 0,668 | 0,750 |
| 0,000066 | 0,762 | 0,837 |
| 0,000055 | 0,953 | 0,957 |
| — (arrivée) | 1,000 | 1,000 |

## Distribution des scores hors plis

8 des 10 tranches de 10 points sont occupées : 415 organisations en 0-9, 14 en 20-29, 72 en 30-39, 53 en 40-49, 19 en 60-69, 46 en 70-79, 43 en 80-89 et 62 en 90-99. Les tranches 10-19 et 50-59 sont vides.

## Reproduction et vérification

```bash
pnpm test:risk     # 31 tests, un comportement par test
pnpm mesure:risk   # relit la base, réécrit bench/results/organisation-risk.json
```

L'interface publique est en anglais :

- `GET /api/risk/organisations` — définition, instantané, cohorte, courbe ROC et AUC publiés ;
- `GET /api/risk/organisations/:id` — score 0-100, probabilité et signaux numériques d'une organisation NA.

## Limites assumées

L'AUC de 0,54 est un résultat faible : les signaux d'ambiance ne concernent que deux organisations positives sur 92, et le secteur est le principal discriminateur. La présence d'un domaine public peut aussi refléter la façon dont les revendications sont rattachées à une organisation, et non un risque accru. Ce score décrit une exposition observée ; il ne prédit pas une compromission et ne déclenche aucune décision automatisée. Aucune donnée personnelle de victime, aucun service payant et aucune source payante n'ont été utilisés.
