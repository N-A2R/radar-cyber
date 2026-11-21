# Secteurs du référentiel : neuf groupes publiable

Le référentiel NA porte un vocabulaire fin (`org.sector` : immobilier,
sante-social, administration, hopital, ecole…). Pour publier une répartition
lisible, on le ramène à neuf groupes : **agroalimentaire, industrie,
construction, commerce, sante, enseignement, public, services, autre**.
La règle est implémentée une seule fois,
`apps/api/src/analyse/secteur-groupe.ts`, et testée dans
`apps/api/test/secteur-groupe.test.ts`.

## Règle de classement

Priorité décroissante, première source reconnue gagne :

1. **`org.sector`** (`source = secteur`, confiance 0,90) — champ enrichi par
   les imports SIRENE ; il porte les corrections humaines (hopital, ecole,
   commune) que le code NAF ne voit pas. Un `sector` connu gagne donc sur un
   NAF contradictoire.
2. **`org.naf`** (`source = naf`, confiance 0,80) — division NAF à deux
   chiffres, ponctuée ou non. C'est le code officiel de l'activité, mais il est
   plus grossier que le secteur enrichi. Une division absente de la table
   n'est pas devinée : on passe à la suite.
3. **`org.kind`** (`source = kind`, confiance 0,50) — ne classe que
   `collectivite` → public, `sante` → sante, `enseignement` → enseignement.
   `entreprise` n'est pas une activité et ne classe rien.
4. **Défaut** (`source = defaut`, confiance 0,20) — `autre`.

Réductions assumées, pour que la règle soit rejouable et discutable :
agriculture **et** agroalimentaire → agroalimentaire ; énergie, eau et
déchets → industrie ; numerique, immobilier, finance, transport,
restauration, culture et services aux entreprises ou aux particuliers →
services ; administration, commune, epci, département et région → public ;
établissements de santé et d'action sociale (hopital, pharmacie, ssiad,
foyer) → sante ; école, collège, lycée → enseignement ; associations,
particuliers employeurs et ESS → autre.

« Autre » n'est jamais une affirmation forte : sa confiance plafonne à 0,40
quand il vient d'un secteur connu, 0,30 d'un NAF connu, 0,20 par défaut.
La confiance mesure la solidité du classement, pas l'existence d'une valeur.

## Colonnes et rejeu

La migration `db/migrate-047-org-secteur-groupe.sql` ajoute `secteur_groupe`,
`secteur_source` et `secteur_confiance` à `org`, avec un index sur le groupe.
Le backfill va par lots de 5 000 en transaction et consigne un fait agrégé
dans le journal. Il est idempotent et accepte `--dry-run` :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/backfill-secteurs-groupe.mts --dry-run
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-secteurs-groupe.mts
```

## Mesure (21 novembre 2026, base de test)

**1 673 151 organisations classées sur 1 673 151 (100 %).** Aucun secteur à
zéro ; la référence « type d'établissement seul » n'en remplissait que 4 sur 9
(les 5 autres étaient à zéro) — c'est le trou que le NAF et le secteur fin
comblent.

| Secteur | Organisations | Part |
|---|---:|---:|
| services | 949 385 | 56,74 % |
| commerce | 175 593 | 10,49 % |
| agroalimentaire | 147 597 | 8,82 % |
| construction | 115 649 | 6,91 % |
| sante | 82 455 | 4,93 % |
| industrie | 76 618 | 4,58 % |
| autre | 73 608 | 4,40 % |
| enseignement | 44 385 | 2,65 % |
| public | 7 861 | 0,47 % |

Hors « autre », 1 599 543 organisations (95,60 %) sont classées dans une
activité déterminée. Le seuil de sortie (80 %) est largement franchi dans les
deux lectures. « Autre » n'est pas un rebut : c'est un choix de non-devinement,
avec sa source et sa confiance.
