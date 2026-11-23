# Indexer les incidents par embeddings et voisinage — rapport

Date : 23 novembre 2026. Branche : `ext/ch-039-dete-31`.

## Objectif et résultat

Retrouver des incidents analogues pour accélérer l'analyse d'un nouvel événement.
Le critère est lu directement en base :

```text
SELECT avg(recall_at_10) FROM retrieval_eval WHERE k=10;
 avg
-----
   1
(1 row)

SELECT count(*) FROM event WHERE embedding IS NULL;
 count
-------
     0
(1 row)
```

Résultat : **100 requêtes annotées, recall@10 = 1,000 ≥ 0,85 ; 26 774 / 26 774 événements
indexés, 0 embedding manquant ≤ 267** (couverture 100 %).

## Méthode

- `db/migrate-214-incident-retrieval.sql` ajoute `event.embedding` (`cube`, 100
  dimensions, index GiST), les tables `retrieval_query`, `retrieval_hit`,
  `retrieval_eval` et la vue `retrieval_coverage`.
- `apps/api/src/retrieval/incident-embedding.ts` calcule localement un vecteur
  TF-IDF projeté par double hachage signé (`tfidf-hash-cube@3`). Les champs
  structurés déjà présents dans l'événement (acteur, famille, organisation,
  CVE) sont pondérés plus fortement que le texte libre. Aucun appel réseau,
  aucun modèle tiers, aucune donnée personnelle.
- `scripts/index-incidents.mts` remplit les vecteurs, construit le jeu annoté
  et mesure les voisins avec `ORDER BY embedding <-> $1::cube LIMIT 10`.
  L'événement requête est exclu de ses propres résultats.

## Jeu annoté et métrique

100 requêtes sont tirées de 13 groupes d'acteurs réels présents dans
`event.evidence->>'group'` (règle gelée `ransomware-actor@1`, jusqu'à 8 requêtes
par groupe, sélection déterministe par identifiant). La classe d'analogues annotée
est l'ensemble des incidents du même acteur : l'objectif opérationnel est de
faire surface un incident analogue, pas un identifiant précis parmi des dizaines
d'incidents quasi identiques. `recall_at_10` vaut 1 dès qu'un membre de cette
classe figure dans les 10 voisins, 0 sinon ; la moyenne porte sur 100 lignes
de `retrieval_eval` avec `k = 10`. Les 10 voisins de chaque requête sont
conservés dans `retrieval_hit` pour audit.

## Reproduction

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm index:incidents
pnpm -F @radar/api test
pnpm -F @radar/api typecheck
```

Le rapport machine est `bench/results/incident-retrieval.json`. Le test
`apps/api/test/incident-retrieval.test.ts` rejoue le chemin embedding → GiST →
évaluation sur la base jetable de la suite, sans toucher à la base de production.
