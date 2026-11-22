# Rapport — Porte d'admission multilingue à l'ingestion

Date : 2026-11-22 · Branche : `ext/chantier-c6` · Périmètre : les 12 départements
de la Nouvelle-Aquitaine (16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87).
Rapport en français ; code, tests et corpus en anglais.

## Chiffre livré

OBJECTIF : atteint — 65 / 65 incidents NA correctement classés par le filtre de langue à l'ingestion

Contre **41 / 65** avec le détecteur historique. Les 24 corrections se décomposent en 21 titres français pourtant étiquetés anglais (résumé d'entreprise en anglais) et 3 revendications réellement anglaises que le détecteur historique rangeait à tort en français.

| Verdict | Corrects | Erreurs |
|---|---:|---:|
| Détecteur historique `fr/en` (titre + résumé) | 41 / 65 | 24 |
| Porte d'admission multilingue livrée | **65 / 65** | **0** |

La vérité de terrain est celle du rapport `#341` : les 3 identifiants détectés hors français avec une confiance ≥ 0,25 (`142014`, `142015`, `142016`) sont anglais, les 62 autres sont français. Le test est formulé avec `RADAR_LANGUAGES=fr` : la porte doit garder les 62 incidents français et refuser les 3 anglais. Résultat figé : `bench/results/multilingual-admission.json` (`byLanguage: {fr: 62, en: 3}`, `wrongIds: []`).

## Ce qui a changé

1. **`apps/api/src/multilingualIncidents/index.ts`** — nouvelle fonction pure `incidentAdmissionVerdict(title, summary, allowed)`. Le titre décide dès qu'il porte au moins deux indices exclusifs ; sinon le résumé complète. Le verdict expose la langue détectée, la langue stockée (`fr` ou `en`, seul domaine autorisé par la contrainte `event.langue`), la décision `keep` et la source du verdict (`title` ou `title+summary`). Aucun accès base, aucun réseau.
2. **`apps/api/src/collectors/filter.ts`** — `languageVerdict()` délègue à cette règle. Les cinq points d'écriture qui l'appellent (boucle des collecteurs, `/api/ingest`, collecteur générique, collecteur Hermès, promotion de quarantaine) bénéficient de la correction sans modification de leurs appels. `detectLanguage()` et son corpus de 30 textes restent inchangés.
3. **`apps/api/test/multilingual-incidents.test.ts`** — 7 tests, un par comportement : titre français + résumé anglais, revendication anglaise, titre mixte à faible confiance, repli sur le résumé, texte vide, branchement effectif de `languageVerdict`, concordance sur les 65 incidents gelés. Ensemble avec `language.test.ts` : **30 tests, 30 réussis**.
4. **`scripts/measure-multilingual-admission.mts`** — mesure reproductible, lecture seule, avec le même corpus gelé de 65 incidents que `#341`. Le script refuse de publier si la porte se trompe encore ou si le corpus et la base divergent.

## Mesure reproductible

Sur le corpus gelé, sans base ni réseau :

```sh
apps/api/node_modules/.bin/tsx scripts/measure-multilingual-admission.mts \
  --offline --json=bench/results/multilingual-admission.json
# incidents: 65 · baseline 41/65 · livré 65/65 · corrections 24 · erreurs 0
```

Rejeu en direct, en lecture seule :

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-multilingual-admission.mts \
  --json=bench/results/multilingual-admission.json
```

Au moment du rejeu, la base locale ne contenait plus que **64** incidents ancrés, contre 65 dans le corpus gelé : le garde-fou de concordance a refusé la publication et le résultat versionné reste la mesure hors ligne. Sur ces 64 lignes, le décompte observé était **64 / 64 corrects, 0 erreur** ; cet écart d'effectif vient de la base locale, pas de la règle. Le script ne modifie aucune ligne.

Vérification complémentaire : `tsc --noEmit -p apps/api/tsconfig.json` passe sans erreur.

Vérification ciblée sur les points d'appel de `languageVerdict` (`filter`,
`language`, `multilingual-incidents`, `contract-ingest`, `promote-regles`,
`quarantine`, `regional-languages`) : **78 tests, 78 réussis** sur une base de
test éphémère. La suite complète du dépôt n'a pas fini dans la fenêtre de
300 s allouée (arrêt du lanceur par timeout) : elle n'est pas présentée comme
verte ici.

## Contraintes

- Nouvelle-Aquitaine uniquement : les 12 codes INSEE restent la porte d'entrée du corpus et de la mesure.
- Sources grises autorisées : aucune source écartée selon son type ; le corpus est repris tel quel de `#341`.
- Aucune donnée personnelle de victime : le résultat publié ne contient que des identifiants, des compteurs et la règle SQL.
- Aucun service payant : PostgreSQL local et fichiers versionnés uniquement.
- Un test par comportement : 7 nouveaux tests, chacun nommé d'après le comportement vérifié.
- `apps/api/src/server.ts` inchangé : **diff de 0 ligne** (≤ 10 demandées).
- Aucune commande supérieure à 60 s, hors suite complète de tests.

## Limites

- `event.langue` garde sa contrainte `CHECK (langue IN ('fr','en'))`. Une langue détectée `de`, `nl`, `pl`, `oc` ou `eu` est stockée `en` : la porte refuse correctement ces événements quand `RADAR_LANGUAGES=fr`, mais leur langue précise n'est pas persistée. La migration 047 est en collision de numéros avec deux autres fichiers ; un numéro libre (064) reste à utiliser si cette colonne doit évoluer.
- Le décompte d'incidents hors français de `#341` garde son seuil de confiance 0,25. La porte d'admission, elle, n'a besoin que d'une langue déterminée : c'est ce qui permet de classer l'objet `51287` comme français sans modifier le chiffre publié (3 incidents hors français).
- Le gain mesuré porte sur les 65 incidents ancrés du corpus gelé. Le comportement sur l'ensemble des 27 899 événements de la base n'a pas été vérifié événement par événement.
