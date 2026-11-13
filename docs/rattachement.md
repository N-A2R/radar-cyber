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
