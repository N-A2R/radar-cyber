# Rapport — filiation organisationnelle en Nouvelle-Aquitaine (21 novembre 2026)

Branche : `ext/chantier-a7`. Périmètre : les douze départements de Nouvelle-Aquitaine (16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87). Ce rapport est rédigé en français ; le code, la migration, le script de mesure et l'interface en ligne de commande sont en anglais.

## 1. État réel observé au départ

Mesures relevées sur la base PostgreSQL de développement (`postgres://radar:radar@localhost:5433/radar`) avant toute écriture :

| Compteur | Valeur observée | Requête |
| --- | ---: | --- |
| Organisations | 1 673 221 | `SELECT count(*) FROM org;` |
| Sources | 376 | `SELECT count(*) FROM source;` |
| Événements | 27 882 | `SELECT count(*) FROM event;` |
| Liens de rattachement établis | 0 | `SELECT count(*) FROM org WHERE parent_org_id IS NOT NULL;` |

Les écarts avec l'énoncé (1 673 151 organisations, 312 sources) reflètent l'état live au moment de l'intervention, plusieurs chantiers parallèles ayant continué à charger le référentiel.

## 2. Résultat mesuré

**14 956 liens de filiation organisationnelle établis avec preuve.**

| Mesure | Valeur | Preuve |
| --- | ---: | --- |
| Candidats structurels dans NA | 14 956 | requête `candidates` ci-dessous |
| Liens réellement écrits avec preuve | 14 956 | requête `established` ci-dessous |
| Lignes mises à jour par l'écriture | 14 956 | sortie du script : `derived: 14956, rows changed: 14956` |

Requête de mesure (extrait de `FILIATION_QUERIES` dans `apps/api/src/filiation/store.ts`) :

```sql
SELECT count(*)::text AS n FROM org c JOIN org p ON p.id = c.parent_org_id
WHERE c.parent_evidence->>'method' = 'siren-prefix'
  AND c.valid_to IS NULL AND p.valid_to IS NULL
  AND c.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87')
  AND p.dept IN ('16','17','19','23','24','33','40','47','64','79','86','87');
```

Le résultat est aussi publié dans `bench/results/filiation-na.json` ; relecture du chiffre : `jq '.established' bench/results/filiation-na.json` → `14956`.

### Nature exacte du lien

La preuve est le préfixe SIRET : un SIRET à 14 chiffres désigne un établissement de l'unité légale identifiée par ses 9 premiers chiffres (SIREN). Les deux extrémités doivent être actives et situées en Nouvelle-Aquitaine. Il s'agit donc du **rattachement officiel établissement → unité légale** tel que le décrit la source INSEE, et non d'une allégation de participation au capital. Les sources de presse ou de fuite auraient pu être utilisées (elles sont autorisées) ; elles n'ont pas été nécessaires ici, la source officielle étant plus forte.

Exemple réel, tel qu'enregistré en base :

```json
{
  "child": "BARRAULT (THOUARS)",
  "parent": "BARRAULT",
  "evidence": {
    "method": "siren-prefix",
    "source": "insee-sirene",
    "dataset": "insee-stock-etablissement-v3",
    "childCode": "02548040100550",
    "parentCode": "025480401",
    "url": "https://annuaire-entreprises.data.gouv.fr/entreprise/025480401"
  }
}
```

## 3. Commande reproductible

Écriture idempotente puis mesure, en une commande (29,7 s observées) :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-filiation.mts \
  --apply --json=bench/results/filiation-na.json
```

Mesure seule, sans écriture :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-filiation.mts
```

Sortie observée : `candidates: 14956`, `established with proof: 14956`.

## 4. Étapes testables

| Étape | Comportement couvert | Test |
| --- | --- | --- |
| Règle pure | SIRET NA → SIREN NA, preuve complète | `an NA establishment links to its NA legal entity with public proof` |
| Filtre géographique | enfant hors NA rejeté | `an establishment outside Nouvelle-Aquitaine is not linked` |
| Qualité du parent | parent hors NA, fermé ou d'un autre jeu rejeté | `a parent outside Nouvelle-Aquitaine, closed or from another dataset is not linked` |
| Validation des codes | SIRET malformé et auto-rattachement rejetés | `malformed identifiers and self-links are rejected` |
| Stabilité | ordre indifférent, un lien par établissement | `extraction is order-independent and emits one link per establishment` |
| Preuve | aucun champ de donnée personnelle dans la preuve | `evidence carries identifiers and a public URL, never victim data` |
| Persistance | écriture idempotente, comptage exact, SQL de preuve | `links persist with proof, are idempotent and are counted once` |

## 5. Répartition par département de l'établissement

| Dept | Liens | Dept | Liens |
| ---: | ---: | ---: | ---: |
| 16 | 749 | 47 | 670 |
| 17 | 2 087 | 64 | 2 306 |
| 19 | 647 | 79 | 585 |
| 23 | 220 | 86 | 814 |
| 24 | 1 018 | 87 | 691 |
| 33 | 3 707 | 40 | 1 462 |
| **Total** | **14 956** | | |

## 6. Contraintes

- **Nouvelle-Aquitaine uniquement** : la liste des douze départements est appliquée à la fois dans la règle pure (`NA_DEPARTMENTS`) et dans les trois requêtes SQL ; parent et enfant doivent tous deux y être situés.
- **Sources grises autorisées** : non utilisées ; la preuve repose sur le stock public INSEE SIRENE (jeu `insee-stock-etablissement-v3`), déjà importé par `scripts/import-sirene-vague2.mts`.
- **Aucune donnée personnelle de victime** : la preuve ne contient que des codes publics SIREN/SIRET, le nom du jeu, la règle et une URL publique ; aucun titre d'événement, extrait d'article ni coordonnée de victime n'est stocké.
- **Aucun service payant** : aucune clé, aucun appel réseau, aucun fournisseur payant ; le calcul est rejouable depuis la base locale.
- **Code et interface en anglais, rapport en français** : modules, commentaires, SQL, CLI et noms de tests en anglais ; le présent document est en français.
- **Diff de `server.ts` ≤ 10 lignes** : 0 ligne modifiée (`git diff --stat -- apps/api/src/server.ts` vide). Le script de mesure est autonome et n'ajoute aucune route ni tâche de fond.

## 7. Vérifications effectuées

- `pnpm -F @radar/api test -- test/filiation-siret.test.ts` : **7 tests réussis, 0 échec**.
- `pnpm typecheck` : réussi pour `apps/api` et `apps/web`.
- Migration `db/migrate-061-org-filiation.sql` appliquée à la base de développement et enregistrée dans `schema_migrations`.
- Artefact `bench/results/filiation-na.json` écrit et relu via `jq` : `established = 14956`, somme des départements = 14 956.

## 8. Limites assumées

- Seuls les établissements dont l'unité légale SIREN est présente dans le référentiel et située en NA sont comptés : c'est un plancher de filiation organisationnelle vérifiable, pas un graphe d'appartenance capitalistique.
- Les liens déduits de textes de presse ou de sites de fuite ne sont pas inclus, faute de résolution non ambiguë des deux organisations dans le référentiel ; les sources grises restent autorisées pour un chantier ultérieur.
- Le champ `parent_evidence` est nullable : les liens préexistants sans preuve ne sont pas comptés, conformément à l'objectif « avec preuve ».
