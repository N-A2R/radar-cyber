# Cycle de collecte robuste — rapport de livraison (2026-11-21)

## Ce qui a changé

- **Reprise après erreur.** `collecte_cycle` (migration 049) garde la liste des
  sources du tour en cours et celles déjà traitées. Un cycle interrompu
  (processus tué, base momentanément absente) reprend par les sources restantes,
  pas depuis le début de la liste. Chaque source est traitée dans un `try`
  indépendant : une panne n'empêche jamais les suivantes. Le point de reprise
  est idempotent (un double marquage ne compte pas deux fois).
- **Backoff exponentiel par source.** Paliers partagés avec le client HTTP :
  1 min, 5 min, 30 min, 2 h (plafond). L'état est persisté dans
  `source.prochaine_tentative_at` : un redémarrage ne remet pas une source en
  difficulté dans la file des « jamais collectées ».
- **Santé par source : `ok` / `rouge` / `morte`.** `ok` après un run réussi,
  `rouge` dès le premier échec (backoff en cours), `morte` après cinq échecs
  consécutifs. `sante` est exposée par `GET /api/sources` et en surbrillance
  dans l'écran Santé. Le passage à `morte` écrit `source.morte` dans le journal
  dans la même transaction que le changement d'état ; aucune ligne n'est
  supprimée. La réactivation admin remet compteur, backoff et santé à zéro.
- **Priorité aux sources jamais collectées.** `planifierCycle` trie : jamais
  tentées, puis tentées sans succès, puis déjà collectées ; à rang égal, la plus
  ancienne tentative passe en premier. Les sources mortes, désactivées ou en
  backoff sont écartées du tour. Le même tri s'applique aux collecteurs dédiés
  (`server.ts`) et au moteur générique.
- **Budget mémoire borné.** Le gazetteer ne construit plus deux `Map` géantes
  pour détecter les clés ambiguës : un tri unique des paires (clé, id, drapeaux)
  suffit, avec des tableaux typés. Les jetons du nom ne sont indexés qu'une
  fois par organisation. En production, les alias sont lus par lots de 20 000
  via `ConstructeurGazetteer` : la mémoire des lignes dépend du lot, pas du
  stock.
- **États vides traités.** Aucune source éligible → cycle ouvert puis clos sans
  charger le gazetteer ; corps vide (304) → run `ok` et santé remise à zéro ;
  flux illisible → `rouge`, backoff, puis `morte` si cela se répète.

## Mesures reproductibles

Gazetteer synthétique, 1 700 000 alias, chargés par lots de 20 000 :

```
NODE_OPTIONS="--expose-gc --max-old-space-size=1024" \
  apps/api/node_modules/.bin/tsx scripts/mesure-gazetteer.mts --synthetique=1700000

départ        : rss 79 Mo · tas 8 Mo
1700000 alias : rss 394 Mo · tas 154 Mo
delta total   : +146 Mo de tas · +315 Mo de rss — budget 500 Mo : OK
clés d'alias  : 1 699 955
```

Le même jeu sans `--expose-gc` donne un pic de 556 Mo de RSS (delta +478 Mo) :
le tas temporaire non encore collecté est compté, pas l'index résident. Le
chiffre de référence est donc le relevé après GC, sous la limite de 500 Mo.

Cycle complet sur 12 sources locales (8 saines, 2 vides, 2 en erreur) :

```
apps/api/node_modules/.bin/tsx scripts/mesure-cycle-collecte.mts --sources=12

mémoire RSS  : 111,1 Mo avant → 136,8 Mo après (+25,7 Mo)
mémoire tas  : 21,3 Mo avant → 25,7 Mo après (+4,4 Mo)
sources      : 10 collectées, 2 en échec, 12 jamais collectées
cycle        : 12/12 traitées
second cycle : 10 collectées, 0 en échec, 10 en attente (2 reportées)
santé finale : 10 ok, 2 rouges, 0 morte
```

Les deux sources en erreur ne sont pas retentées au cycle suivant : le backoff
persistant est vérifié, pas seulement le compteur d'échecs. Le rapport
`mémoire ... / sources ...` est aussi écrit dans le journal à chaque cycle en
production (`runGenericSources`).

## Vérification

`pnpm typecheck` et la suite API complète sont exécutés avant commit. Les tests
`collecte-robuste.test.ts` couvrent la planification pure, les paliers de
backoff, les lots du gazetteer, les transitions d'état et la reprise en base.
