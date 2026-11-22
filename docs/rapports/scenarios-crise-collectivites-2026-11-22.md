# Scénarios de crise pour collectivités — mesure du 22 novembre 2026

## Objectif mesuré

Un générateur de scénarios à partir des données réelles, avec **10 scénarios produits**.

| Compteur | Valeur |
| --- | ---: |
| Base réelle : organisations / sources / événements | 1 673 151 / 312 / 26 259 |
| Signaux réels Nouvelle-Aquitaine rattachés à une organisation | 50 |
| Signaux rejetés pour donnée personnelle de victime | 2 |
| Signaux exploitables | 48 |
| Signaux effectivement utilisés par les 10 scénarios | 31 |
| **Scénarios produits** | **10** |
| Départements Nouvelle-Aquitaine couverts | 10 |
| Sources grises mobilisées / sources presse mobilisées | 6 / 5 |
| Scénarios hors région / avec donnée personnelle / avec service payant / sans source | 0 / 0 / 0 / 0 |
| Checks d'objectif vérifiés | 8 / 8 |

## Méthode

Le générateur est implémenté par étapes testables, un test par comportement (18 tests, tous verts) :

1. **Périmètre** — seuls les 12 départements de Nouvelle-Aquitaine sont acceptés (16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87). La Charente (16), la Charente-Maritime (17), la Corrèze (19), la Creuse (23), la Dordogne (24), la Gironde (33), les Landes (40), le Lot-et-Garonne (47), les Pyrénées-Atlantiques (64), les Deux-Sèvres (79), la Vienne (86) et la Haute-Vienne (87) sont les seuls codes retenus. 65 et 18 sont exclus.
2. **Filtrage** — les signaux sont les événements réels rattachés à une organisation de la région (50 lignes). Deux sont écartés parce que leur titre ou leur résumé contient une adresse e-mail, un numéro de téléphone ou un nom de victime.
3. **Regroupement** — les signaux restants sont groupés par département et par thème issu de la famille réelle de l'événement : rançongiciel, fuite de données, intrusion ciblée, alerte publique, vulnérabilité, exposition d'identifiants.
4. **Classement** — chaque groupe est scoré par nombre de signaux, diversité des sources, nombre d'organisations, sévérité maximale et étendue temporelle. Un scénario par département est retenu en priorité, puis les groupes les mieux notés complètent jusqu'à 10.
5. **Publication** — chaque scénario ne contient que des codes, des dates, des empreintes SHA-256 tronquées et un playbook anglais fixe. Aucun titre, résumé, nom d'organisation, nom de victime ni URL n'est recopié.

Le code et l'interface (sortie console et schéma JSON) sont en anglais ; le présent rapport est en français. Aucun appel réseau, aucune clé d'API et aucun service payant n'interviennent dans la mesure. Le diff de `apps/api/src/server.ts` est de **0 ligne**. Chaque commande exécutée reste sous les 60 secondes (mesure : moins d'une seconde au-delà du démarrage de tsx).

## Scénarios produits

| Identifiant | Département | Thème | Signaux | Sources | Période observée |
| --- | --- | --- | ---: | ---: | --- |
| na-33-targeted-intrusion-2026-10-21 | Gironde | targeted-intrusion | 7 | 6 | 21/10 → 21/11/2026 |
| na-17-ransomware-2026-11-10 | Charente-Maritime | ransomware | 3 | 1 | 10 → 19/11/2026 |
| na-86-ransomware-2026-11-11 | Vienne | ransomware | 2 | 2 | 11 → 17/11/2026 |
| na-87-data-leak-2026-10-18 | Haute-Vienne | data-leak | 2 | 2 | 18/10 → 20/11/2026 |
| na-64-ransomware-2026-11-10 | Pyrénées-Atlantiques | ransomware | 2 | 1 | 10 → 20/11/2026 |
| na-47-targeted-intrusion-2026-11-12 | Lot-et-Garonne | targeted-intrusion | 2 | 2 | 12 → 21/11/2026 |
| na-24-ransomware-2026-11-11 | Dordogne | ransomware | 2 | 1 | 11 → 14/11/2026 |
| na-16-ransomware-2026-11-14 | Charente | ransomware | 1 | 1 | 14/11/2026 |
| na-79-ransomware-2026-11-11 | Deux-Sèvres | ransomware | 1 | 1 | 11/11/2026 |
| na-33-ransomware-2026-11-10 | Gironde | ransomware | 9 | 1 | 10 → 20/11/2026 |

La Gironde apparaît deux fois : elle concentre à la fois le cluster d'intrusion ciblée le plus diversifié (6 sources) et le plus gros cluster rançongiciel (9 événements). Les dix autres départements de la région n'ont aucun événement rattaché à une organisation dans la base et ne peuvent donc pas produire de scénario mesuré.

## Périmètre et contraintes

- **Nouvelle-Aquitaine uniquement** : filtre sur le département de l'organisation, vérifié à la génération et à l'audit.
- **Sources grises autorisées** : suivis rançongiciel, canaux publics et flux d'exposition sont acceptés et étiquetés `grey` ; les sources officielles et la presse sont étiquetées séparément. Aucun service payant n'est utilisé.
- **Aucune donnée personnelle de victime** : filtrage en amont, absence de champ texte libre dans le schéma publié, et audit indépendant qui compare le JSON publié aux titres et résumés bruts (0 recouvrement).
- **Mesure reproductible** : le décompte est déterministe ; deux exécutions donnent les mêmes 10 scénarios et les mêmes compteurs.

## Objectif vérifié

- scénarios produits à partir de données réelles : 10 (attendu ≥ 10) — OK
- organisations de la base : 1 673 151 (attendu ≥ 1 000 000) — OK
- sources de la base : 312 (attendu ≥ 300) — OK
- événements de la base : 26 259 (attendu ≥ 20 000) — OK
- scénarios hors Nouvelle-Aquitaine : 0 (attendu 0) — OK
- scénarios contenant une donnée personnelle de victime : 0 (attendu 0) — OK
- scénarios reposant sur un service payant : 0 (attendu 0) — OK
- scénarios sans source réelle : 0 (attendu 0) — OK

## Reproduction

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm mesure:scenarios
pnpm verify:scenarios
```

Équivalent sans pnpm (utile lorsque `node_modules` est un lien symbolique) :

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-crisis-scenarios.mts
apps/api/node_modules/.bin/tsx scripts/verify-crisis-scenarios-objective.mts
apps/api/node_modules/.bin/tsx --test apps/api/test/crisis-scenarios.test.ts
```

Résultat publié : `bench/results/crisis-scenarios-2026-11-22.json`.
