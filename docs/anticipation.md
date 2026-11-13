# Anticipation : mesurer ce qui précédait un incident, pas promettre de le prédire

> Chantier 11. `tsx scripts/mesure-anticipation.mts --json=…` rejoue la mesure.
> La logique de classement et de synthèse vit dans `apps/api/src/analyse/anticipation.ts`
> et se teste sans base.

## La question, posée honnêtement

Un radar qui prédit est un radar qui ment. La question défendable est plus
étroite : **avant un fait, le radar disposait-il de quelque chose ?** Et si oui,
de quelle nature — un indicateur technique, une revendication antérieure, un
signal d'ambiance, une alerte déjà émise ?

Les deux réponses sont publiables. C'est précisément pour cela qu'il faut
mesurer : « nous n'avions rien » est une information, pas un échec à cacher.

## Méthode

1. **Fait principal** : pour chaque organisation et chaque famille, le premier
   événement d'une série sur 365 jours. C'est ce qu'on aurait voulu voir venir.
2. **Signaux antérieurs** : tout ce qui concernait la même organisation dans la
   fenêtre d'avance (21 jours par défaut), alertes comprises.
3. **Classement** par ce que le signal prouve :
   - `indicateur` — un actif technique signalé (le plus proche d'un
     avertissement) ;
   - `revendication` — le nom circulait déjà chez les attaquants ;
   - `ambiance` — le nom apparaissait, sans preuve d'attaque ;
   - `alerte` — une règle avait déjà jugé le sujet digne d'attention.
4. **Publication** : part des faits précédés d'au moins un signal, avance
   médiane, et répartition par nature.

Un fait compte **une fois par nature**, jamais une fois par signal : trois
alertes sur le même sujet ne font pas trois anticipations.

## La réserve, écrite dans le code

En dessous de **10 faits**, la mesure se déclare `indicative`. Un « 67 % » sur
trois faits dit une tendance, pas une capacité — et c'est exactement le genre de
chiffre qu'un projet se met à citer hors contexte. Le seuil est dans
`SEUIL_INDICATIF`, pas dans une phrase de ce document.

## Ce que la base de développement donne

```
3 faits examinés · 2 précédés d'un signal (67 %)
avance médiane : 16 jours
indicateur 1 · ambiance 1 · revendication 0 · alerte 0
réserve : 3 faits seulement → tendance, pas capacité
```

Ces trois faits viennent d'une **série de démonstration** créée hors dépôt
(`/tmp/seed-anticip.mts`, supprimée après usage) : la base de développement ne
contient aucune série réelle d'incidents rattachés. Le résultat est donc un
**test de bout en bout du mécanisme**, pas une mesure du terrain.

Sur la base réelle, sans série :
```
0 fait(s) principal(aux) examiné(s)
```
et le script le dit — « la mesure est vide, pas nulle » — au lieu d'afficher
0 %.

## Ce que ce chantier ne fait pas

Il ne produit **aucune prédiction**, aucun score d'anticipation, aucun agent.
Il mesure une capacité existante. Le programme prévoyait des « agents de
rupture » (chantier 10) : les construire avant d'avoir ce chiffre reviendrait à
ajouter du bruit à un signal dont on ignore la force.

Le vrai gisement, si la mesure devient réelle : le délai entre le premier
signal et le fait, par nature et par famille. C'est là qu'on saurait si un
indicateur technique vaut trois semaines d'avance — ou trois jours.
