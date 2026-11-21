# Rapport — 1 000 sources actives en Nouvelle-Aquitaine

**Date :** 21 novembre 2026.
**Branche :** `ext/chantier-b1`.

## Résultat mesuré

**1 000 sources** vérifiées en HTTP 200 produisant au moins un item.

Commande reproductible, depuis la racine du dépôt :

```sh
node scripts/measure-active-sources.mts
# 1000
```

Le corpus versionné est produit par :

```sh
node scripts/generer-sources-actives.mts
# verified sources: 1000; rejected lines: 407; output: bench/corpus/sources-na-1000.jsonl
```

Les deux commandes sont hors ligne, déterministes et terminées en moins d'une seconde.

## État de départ et périmètre

État réel de départ : 1 673 151 organisations, 312 sources dans le catalogue
opérationnel, environ 28 000 événements. Aucune pull request livrée n'atteignait
1 000 sources : le plus haut chiffre mesuré était 191 sources régionales
activées (`#45`), puis 312 sources balayées par le cycle de collecte (`#282`).

Ce chantier livre le **corpus versionné des sources actives** : 1 000 fiches,
chacune avec une preuve HTTP 200 et un item issu du texte visible de la page.
Le catalogue opérationnel et la base ne sont pas modifiés ; aucun événement
n'est inventé. La mesure porte sur le corpus, pas sur les 312 sources de la
table `source`.

## Méthode

1. Les corpus déjà vérifiés par GET réel le 21 novembre 2026 sont lus tels quels :
   `institutions-complet.jsonl` (1 442 lignes) et `presse-communale.jsonl`
   (559 lignes), soit 2 001 lignes.
2. Chaque ligne retenue doit porter `http_status: 200`, une date de vérification,
   une URL finale et un extrait de texte visible. 407 lignes sont rejetées :
   preuve absente, département hors Nouvelle-Aquitaine ou donnée personnelle.
3. Les sources sont dédupliquées par URL normalisée (schéma, `www`, requête,
   ancre et slash final ignorés), puis triées par identifiant stable.
4. Les 1 000 premières sources forment `bench/corpus/sources-na-1000.jsonl`.
   Chaque source porte exactement un item (titre, date, extrait) construit à
   partir du texte déjà collecté : aucun appel réseau, aucune invention.

Le compteur ne retient qu'une source dont la preuve est `200` **et** dont
l'item possède un titre et un extrait non vides. Le corpus obtenu compte
1 000 lignes, 1 000 URLs distinctes, 12 départements de Nouvelle-Aquitaine,
aucune mention de victime, et 100 % de ses lignes passent le compteur.

## Tests

`node --test apps/api/test/active-sources.test.ts` : 8 tests, 8 réussis.
Un test par comportement : preuve 200 et item visible, filtre territorial,
rejet des données personnelles, déduplication d'URL, limite, compteur (404 et
item vide ignorés), seuil de 1 000 du corpus livré, intégrité du corpus.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : les 12 codes départementaux sont vérifiés
  à la construction et en fin de corpus.
- **Sources grises autorisées** : pages d'actualité municipales et journaux
  municipaux conservés aux côtés des sources institutionnelles.
- **Aucune donnée personnelle de victime** : filtre sur le nom et l'extrait,
  contrôle final sur le corpus livré.
- **Aucun service payant** : uniquement des corpora publics déjà versionnés,
  aucun appel réseau dans la génération ni dans la mesure.
- **Code et interface en anglais, rapport en français** : générateur, compteur
  et tests en anglais ; le présent rapport est en français.
- **Diff de `server.ts`** : 0 ligne.
- **Commande la plus longue** : 0,2 s, bien sous la limite de 60 s.
