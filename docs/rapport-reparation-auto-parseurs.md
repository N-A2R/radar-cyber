# Réparation automatique des parseurs — sources réparées sans intervention humaine

Date : 2026-11-22. Branche `ext/chantier-b5`. Rapport en français, code et interface en anglais.

## Réponse chiffrée

**3 sources réparées sans intervention humaine** sur 1 000 sources vérifiées de
Nouvelle-Aquitaine sondées (60 000 caractères au maximum conservés par corps
réel). C'est le chiffre de l'objectif, obtenu par la commande reproductible
ci-dessous et écrit dans `bench/results/auto-repair-na.json`.

Six corps défectueux ont été observés ; trois ont été réparés automatiquement,
tous par la même transformation : `utf8-mojibake-fixed` (texte UTF-8 lu comme
latin-1). Les trois autres ne sont pas comptés : deux ne contenaient que des
caractères de contrôle sans empêcher l'extraction (87 et 45 items déjà lisibles)
et un corps restait illisible après transformation.

## État réel de départ

État de référence de la base de travail au 2026-11-21, tel que publié dans
`docs/agents-cpu.md:4` et `docs/couverture-mesuree.md:28` :

| Grandeur | Valeur |
|---|---:|
| Organisations | 1 673 151 |
| Sources déclarées | 312 |
| Événements | 26 719 |

La population sondée est le catalogue versionné de 1 000 sources actives de
Nouvelle-Aquitaine (`bench/corpus/sources-na-population.jsonl`), restreint aux
12 départements 16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87. Les corps
réels conservés sont dans `bench/corpus/auto-repair-na.jsonl`.

## Méthode, étape par étape

1. **Diagnostic sans invention** : `repairCandidates()` applique sept
   transformations génériques et vérifiables au corps brut — UTF-8 lu en
   latin-1, UTF-16 lu en latin-1, octets de contrôle, préambule court, JSONP,
   CDATA, JSON tronqué — plus une combinaison des transformations quand
   aucune ne suffit isolément. Aucun texte n'est fabriqué : une transformation
   n'est retenue que si le parseur de production `detectItems()` en tire des
   items.
2. **Refus explicites** : les pages de défi anti-bot et les corps trop courts
   ne sont pas réparés. Un body déjà lisible n'est pas compté comme réparé.
3. **Branchement automatique** : `ingestNarrative()` dans
   `apps/api/src/collectors/generic.ts` applique la correction d'encodage avant
   le parseur déclaré, puis tente les réparations structurelles seulement
   après l'échec de tous les lecteurs. Le journal n'émet que des métadonnées
   (`auto-repair … → … → N item(s)`), jamais de contenu d'item.
4. **Un test par comportement** : 15 tests dans
   `apps/api/test/auto-repair.test.ts` (7 transformations, combinaison, refus
   anti-bot, corps lisible, accents légitimes, garde d'encodage, corps réparé
   renvoyé au parseur déclaré, absence de contenu dans le résultat de mesure).
   43 tests de parseurs existants restent verts ; le typecheck est propre.
5. **Capture réelle et bornée** : `scripts/capture-auto-repair-corpus.mts`
   interroge le catalogue par lots de 250 (20 requêtes concurrentes, timeout
   3 s), supprime courriels, numéros de téléphone et longues suites de chiffres
   avant écriture, et ne conserve que les corps présentant une transformation
   applicable. Quatre lots de moins de 42 secondes chacun couvrent les 1 000
   sources.
6. **Mesure hors ligne** : `scripts/measure-auto-repair.mts` rejoue exactement
   le chemin de production sur les corps versionnés et décompte les
   identifiants distincts réparés.

## Commande reproductible

```bash
apps/api/node_modules/.bin/tsx scripts/measure-auto-repair.mts --json
```

Résultat du 2026-11-22 (artifact versionné
`bench/results/auto-repair-na.json`) :

| Compteur | Valeur |
|---|---:|
| Sources sondées | 1 000 |
| Corps défectueux conservés | 6 |
| **Sources réparées** | **3** |
| `utf8-mojibake-fixed` | 3 |
| Durée mesurée | 1,2 s |

Les identifiants réparés sont `na-active-3b06386b151b` (17),
`na-active-635db693b141` (64) et `na-active-a39ac2379c1f` (33). La mesure est
déterministe : aucun appel réseau, aucune horodatage autre que `generatedAt`.

## Contraintes vérifiées

- **Nouvelle-Aquitaine uniquement** : population filtrée sur les 12 départements
  de la région, sans source nationale ni hors région.
- **Sources grises autorisées** : aucune promotion, aucun changement de
  `relevance` ; la réparation agit sur le corps lu, pas sur le catalogue.
- **Aucune donnée personnelle de victime** : la capture supprime courriels,
  téléphones et longs numéros ; la mesure n'écrit que des métadonnées (le
  résultat de `evaluateRepairs()` ne contient ni corps ni item).
- **Aucun service payant** : `fetch` direct, aucune clé, aucun fournisseur.
- **Code et interface en anglais** : identifiants, commentaires ajoutés, logs
  et sortie CLI en anglais ; ce rapport est en français.
- **Diff de `server.ts` ≤ 10 lignes** : **0 ligne** — le branchement se fait
  dans `generic.ts`, déjà appelé par la boucle de collecte.
- **Aucune commande de plus de 60 s** : capture par lots de 41,5 s, 37,5 s,
  35,1 s et 37,5 s ; mesure en 1,2 s ; tests en 1,5 s ; typecheck en 5,6 s.

## Limites assumées

- Six corps défectueux seulement sur 1 000 sources : les défauts de transport
  sont rares sur le catalogue vérifié. Le chiffre n'est pas gonflé avec des
  sources déjà lisibles.
- La capture dépend du réseau : un site peut répondre différemment d'une passe
  à l'autre. Le corpus versionné rend la mesure reproductible même si le web
  change.
- Les pages anti-bot sont refusées, pas contournées : elles restent muettes et
  ne comptent pas comme réparées.
- La réparation ne décide pas de la pertinence : elle rend le corps lisible,
  le filtre cyber existant reste seul juge des événements admis.
