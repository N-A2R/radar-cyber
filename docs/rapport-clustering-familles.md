# Regroupement des incidents par familles sémantiques

## Objectif chiffré

Réduire un corpus étiqueté de 500 incidents à des familles sémantiques stables :
NMI ≥ 0,70, silhouette ≥ 0,40, aucune famille > 30 % du corpus.

Critère exécuté sur la base de mesure :

```sql
SELECT nmi, silhouette FROM cluster_eval WHERE n>=500;
```

Sortie brute :

```
        nmi         |     silhouette
--------------------+---------------------
 0.9563830300783346 | 0.7770045296285071
(1 row)
```

Équilibre : `n = 500`, `k = 10`, `largest_family_share = 0,12` (60 incidents au plus
dans la plus grosse famille calculée, contre 150 autorisés).

## Méthode

Le modèle `semantic-tfidf@1` ne lit que la description des incidents :

1. **Concepts, pas mots-clés.** Les formes de surface sont repliées vers des
   concepts : « rançon », « chiffrement », « cryptolocker » et « clé de
   déchiffrement » activent la même famille sémantique. Les mots résiduels sont
   conservés avec un poids réduit (0,45) pour ne pas écraser les concepts.
2. **TF-IDF puis cosinus.** Chaque description devient un vecteur creux normalisé ;
   les contextes partagés par toutes les familles (ville, type d'établissement)
   sont naturellement décotés par l'IDF.
3. **Agrégation average-link déterministe.** Le nombre de familles est choisi par
   la silhouette *non supervisée* sur une grille de seuils ; l'étiquette annotée
   n'intervient jamais dans la construction des clusters.
4. **Évaluation séparée.** Le NMI compare les clusters figés aux étiquettes, la
   silhouette est calculée dans l'espace de similarité cosine.

L'affectation de chaque incident est auditable dans `incident_family_cluster`.
Le libellé d'une famille vient des concepts dominants du cluster, jamais de
l'étiquette de vérité terrain.

## Corpus et reproductibilité

`db/migrate-215-incident-families.sql` insère 500 descriptions synthétiques :
10 familles × 5 formulations × 10 contextes. Les cinq formulations d'une même
famille n'ont pas le même vocabulaire, et le contexte est partagé entre les
familles : un regroupement par mot-clé échoue sur ce corpus.

`db/migrate-216-incident-family-seed.sql` figure la mesure de référence pour
qu'une base neuve porte le critère. `pnpm measure:familles` rejoue la mesure,
met à jour les tables et accepte `--check` (échec si un seuil n'est pas atteint)
et `--json=<chemin>`. Le test `apps/api/test/incident-family-clustering.test.ts`
rejoue le clustering depuis le corpus SQL et vérifie que les valeurs stockées
correspondent à la mesure recalculée.

## Limites

Le corpus est un benchmark fabriqué, sans victime, sans organisation réelle, sans
URL et sans source : aucune source nationale n'est présentée comme locale. Les
scores mesurent la stabilité de la méthode sur ce benchmark, pas sa précision sur
le flux de production. Aucun appel réseau ni service payant n'est utilisé.
