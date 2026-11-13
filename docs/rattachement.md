# Rattachement des événements aux organisations

Comment le radar décide qu'un article parle de la mairie de Tarnos plutôt que de
la ville de Tarnos en général — et pourquoi il refuse de deviner.

## Le problème, chiffré

Le référentiel contient 34 330 organisations (4 462 collectivités, 10 008
établissements de santé, 6 528 établissements scolaires, 13 332 entreprises).

Jusqu'au 12 novembre 2026, l'ingestion utilisait `matchOrgForText` : une
comparaison de jetons entre le texte et le `name` de **toutes** les
organisations, exigeant **un seul candidat** dans toute la table. Sur 800
lignes, cela tenait. Le référentiel étendu a révélé l'effondrement :

| Moteur | Organisations | Incidents du corpus rattachés | Faux |
| --- | --- | --- | --- |
| `matchOrgForText` | 4 462 | 5 / 15 | — |
| `matchOrgForText` | 34 330 | **1 / 15** | — |
| Moteur d'alias (`match/core`) | 34 330 | 12 / 15 | **4** |
| **Gazetteer** (ce document) | 34 330 | **7 / 15** | **0** |

Le moteur d'alias trouvait plus, mais se trompait : « Vignobles Toutigeac, en
Gironde » était rattaché au **Département de la Gironde**, et « Ymed » à
« S-SERVICES » sur le seul mot « services ». Un rattachement faux est plus
coûteux qu'une absence : il attribue une attaque à une organisation qui n'a
rien subi.

## Les trois règles

### 1. Un nom de lieu ne tranche pas

« Bordeaux » est un alias de la commune, d'une école et de plusieurs
entreprises. Un article qui mentionne Bordeaux ne dit pas que la mairie est
victime.

Seul un alias portant un **rôle** — `ville de`, `mairie de`, `commune de`,
`département de`, `agglomération de`… — ou un nom **distinctif** (au moins deux
jetons dont un mot propre) désigne une organisation. Les toponymes nus sont
exclus de l'index de décision, pas de la base.

### 2. L'ambiguïté se départage sur des indices, jamais au hasard

« EHPAD Résidence du Parc » existe dans quatre communes. Le texte qui précise
« à Champdeniers » tranche : on retient le candidat dont la commune est citée.
À défaut, le département cité. À défaut, l'alias le plus long (le plus
spécifique). Si rien ne départage, on rend `null` en conservant les candidats
pour la revue — on préfère manquer un rattachement que d'en inventer un.

### 3. L'index inversé remplace le balayage

L'index est construit par premier jeton d'alias : on ne consulte que les alias
qui commencent par un mot réellement présent dans le texte. Le coût dépend de la
phrase, jamais de la taille du référentiel (44 071 alias indexés en ~480 ms).

## La porte d'admission

La même mécanique sert de porte : un article qui ne parle pas de cyber n'entre
que s'il désigne une organisation **nommée**.

Le chargement du référentiel a ouvert une faille qu'il fallait refermer. La
porte acceptait tout nom d'organisation présent en sous-chaîne. Tant que le
référentiel ne contenait que des collectivités, cela restait rare. Avec 710
écoles nommées « Ecole primaire » :

```
AVANT : « Une école primaire fermée pour travaux à Périgueux »  → entrait en base
APRÈS : refusé — la porte exige un mot propre, pas une catégorie
```

Vérifié de bout en bout sur une ingestion réelle (flux local, 5 items) :

```
RATTACHÉ  La Ville de Tarnos victime d'une cyberattaque  → Commune de Tarnos
refusé    Une école primaire fermée pour travaux         (hors_sujet)
RATTACHÉ  EHPAD Résidence du Parc de Champdeniers        → le bon EHPAD (indice : commune)
sans org  Vignobles Toutigeac, en Gironde, cyberattaque  → aucun (plus de faux positif)
```

## Où vit le code

| Fichier | Rôle |
| --- | --- |
| `apps/api/src/match/generique.ts` | vocabulaire commun aux deux étages (mots génériques, mots de rôle) |
| `apps/api/src/match/gazetteer.ts` | le moteur : index, résolution, arbitrage — sans base |
| `apps/api/src/collectors/org-gazetteer.ts` | chargement partagé par run, invalidable |
| `apps/api/src/collectors/relevance.ts` | porte d'admission + pont `matchOrgForText` |
| `apps/api/src/collectors/generic.ts` | l'ingestion : porte puis rattachement |

Tests : `apps/api/test/gazetteer.test.ts` (17 cas, dont la régression de la
porte). Suite API : 225/225.

## Ce qui reste ouvert

- **8 incidents sur 15 restent non rattachés**, et c'est souvent correct : «
  Ymed » n'est pas au référentiel entreprises (13 332 lignes, 98 % de
  numérique), « Intermarché d'Altillac » est une enseigne nationalement
  absente du jeu. Le levier est la couverture du référentiel, pas le moteur.
- **Les alias mono-jeton** (« Ymed », « Toutigeac ») restent hors de l'index de
  décision : trop courts pour trancher seuls. Ils pourraient trancher dans un
  contexte contraint (titre d'or, source spécialisée) — à mesurer avant.
- **Le moteur d'alias `match/core.ts` coexiste** et sert aux revues et aux
  benches. Il est plus permissif ; ne pas le rebrancher sur l'ingestion sans
  rejouer la mesure ci-dessus.

---

## Audit du 13 novembre 2026 — le moteur en double

Le tableau de bord affichait **55 % d'événements rattachés**. C'était faux :
sur 2 482 rattachements en base, **2 464 n'avaient aucun fondement**.

### La cause

`collectors/correlate.ts` entretenait un **second résolveur d'organisations**,
distinct du gazetteer partagé. Ses règles :

1. domaine exact — sain ;
2. « tous les jetons significatifs du nom présents dans le texte, au moins
   deux jetons pour éviter les noms génériques ».

Le garde-fou des deux jetons se contournait par la ponctuation. Un nom comme
`CODE 202 (CODE 202)` se normalise en `code 202 code 202` : **le même jeton
deux fois**, donc « deux jetons ». Or `code` figure dans presque tous les CVE.

Mesuré ensuite : 676 événements rattachés à cette seule organisation, dont 589
CVE Microsoft, Adobe et Apple ; un incident de Humboldt (Californie) rattaché à
une société de Gironde ; « World Wide Fittings » rattaché à une entreprise de
Bordeaux.

### Le correctif

**Le résolveur en double a été supprimé.** `correlate.ts` ne garde que la
stratégie domaine — une égalité de clé, pas une ressemblance. La résolution par
nom passe par `designateOrganization`, le moteur unique qui sert déjà à
l'ingestion, avec ses règles d'homonymes, de rôles institutionnels et de lieux
ambigus.

Le geste compte autant que le résultat : deux implémentations du même jugement
divergent toujours, et c'est la plus permissive qui gagne en production.

### Mesures après correctif

| Mesure | Avant | Après |
| --- | --- | --- |
| Rattachements en base examinés | 2 482 | 2 482 |
| Rattachements sans fondement | 2 464 | **0** |
| Corpus de référence (20 incidents) | 5/15 en fenêtre | **5/15 (identique)** |
| 400 événements collectés sans org | 3 faux positifs | **0** |

Le taux de couverture publié ne bouge pas — c'est normal : il était calculé
avec `resoudre`, qui sous-estimait, et il est désormais calculé avec le moteur
de production. Le chiffre est le même, sa provenance est meilleure.

`scripts/repair-rattachements.mts` rejoue le contrôle sur n'importe quelle base
et consigne chaque lien défait au journal (`orgId` null) : rien n'est effacé.

### Ce qui reste faux

Les 18 rattachements qui avaient survécu au premier filtre étaient eux aussi
mauvais (« City of Humboldt » → FACILITY PROJECT). Le moteur partagé refuse
désormais ces textes, mais le corpus montre la vraie limite : **le flux
collecté parle très peu de la région**. Un CVE ne se rattache pas à une
entreprise girondine, et aucun réglage de seuil ne changera cela.

### Ce que la mise en service a appris

Le correctif a été appliqué, puis la base a continué de se remplir de liens
faux : **12 359 de plus** en une heure. La cause n'était pas le code mais
l'**exploitation** — un processus API démarré avant le correctif continuait de
tourner, et il réappliquait l'ancienne règle à chaque passage de corrélation.

Une correction qui n'est pas suivie d'un redémarrage n'est pas une correction.
C'est écrit ici parce que le même piège se représentera : `correlate.ts` et le
serveur ne se rechargent pas à chaud.

Après redémarrage, nouvelle mesure sur la même base :

| | |
| --- | --- |
| Événements orphelins proposés au corrélateur | 7 292 |
| Rattachements produits par le moteur corrigé | **2** |
| Rattachements fautifs restants, puis défaits | 12 359 |
| Rattachements en base après réparation | 169 sur 18 981 |

---

## Le piège d'exploitation : deux instances sur une base

Après le correctif, les liens faux **ont continué d'apparaître**. Cause : un
second processus API tournait encore — le service systemd `radar-api`, lancé
depuis le clone principal, qui n'avait pas les correctifs. Chaque cycle de
corrélation réappliquait l'ancienne règle.

Leçon d'exploitation : **un correctif n'est actif que dans les processus
redémarrés après son déploiement.** Vérifier qui tient le port et quand il a
démarré (`ps -eo pid,lstart,args`) fait partie de la correction.

### Deuxième passe : les faux positifs résiduels

La réparation avait laissé 3 liens vers « SCHNEIDER ELECTRIC FRANCE »
(Rueil-Malmaison, Hauts-de-Seine) — des revendications d'un site de fuite qui
ne concernent pas la région. Vérifié : aucune entité Schneider dans le
référentiel de la région (0 ligne en Gironde, Loire-Atlantique ou Bordeaux).

La règle de réparation a été resserrée : elle demande maintenant au **moteur
de production** s'il rattacherait encore le texte. Si la réponse diffère de la
base, le lien vient d'une règle qui n'existe plus.

Bilan des deux passes : **2 476 liens faux défaits**, 0 en base.

---

## Les particules ne portent pas de nom

Le corpus de référence a produit un cas net : la presse écrit « SDIS **des**
Landes », le référentiel porte « SDIS LANDES ». Les fenêtres de jetons étaient
contiguës, donc la séquence « sdis des landes » ne frappait jamais l'alias
« sdis landes » — un incident parfaitement identifiable restait non rattaché.

`match/gazetteer.ts` essaie désormais **deux familles de fenêtres**, de la plus
longue à la plus courte : contiguës d'abord (les alias du référentiel
contiennent eux-mêmes des particules — « Ville de Tarnos »), puis sans
particules.

La première tentative ne gardait que la seconde famille : six tests du
gazetteer sont tombés, parce qu'un alias qui contient une particule ne se
trouvait plus. Les deux familles coexistent donc, et l'ordre est explicite.

Effet mesuré sur la couverture : **5/15 (33,3 %) → 7/18 (38,9 %)**. Le
dénominateur a grandi (trois incidents réels ajoutés au corpus) et le
numérateur aussi (deux d'entre eux sont vus).
