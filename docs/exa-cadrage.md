# Exa comme source de comblement du référentiel — cadrage et coût

> Note de cadrage, 2026-11-13, mise à jour 2026-11-13 (mode Agent).
> Rien n'est branché : ce document dit ce qu'Exa apporte, ce qu'il coûte,
> et pourquoi le **mode Agent / Ultra** de ta capture change l'équation — mais
> heurte toujours la règle « zéro euro ».
> Sources en fin de note.

## Ce qu'est Exa — deux produits sous le même nom

**1. `/search` — le moteur.** `POST https://api.exa.ai/search`, en-tête
`x-api-key`, index vectorisé par Exa. Tu envoies une phrase, il renvoie des
pages + leur texte (filtre `category: "company"` pour les pages d'entreprises).

**2. `/agent` — l'orchestrateur.** C'est celui de ton screenshot. Ce n'est plus
une recherche, c'est un **run asynchrone multi-étapes** : tu décris une tâche en
langage naturel, Exa la découpe en sous-tâches, lance des sous-agents en
parallèle sur plusieurs domaines, vérifie des critères, et te rend un **JSON
structuré validé contre ton schéma + la citation par champ**.

C'est exactement la différence entre :
- `/search` : « cherche acmefan.com » → 10 résultats à parser toi-même ;
- `/agent` : « pour ces 411 noms, dis pour chacun si c'est une entreprise
  française, son domaine canonique, sa ville, son SIREN si tu le trouves,
  sinon renvoie `cannot_verify` — jamais `absent` sans preuve » → un tableau
  prêt à relire.

## Le mode Agent en détail — ce que dit ta capture

### Le SDK que tu as à l'écran

```python
from exa_py import Exa

exa = Exa()  # EXA_API_KEY en env
run = exa.agent.runs.create(
    query="Find all companies building browser automation tools in the United States.",
    effort="ultra",
)
run = exa.agent.runs.poll_until_finished(run.id, timeout_ms=3*60*60*1000)
print(run.stop_reason)       # schema_satisfied | budget_reached | time_limit_reached | stopped | error
print(run.output.structured) # ton JSON validé
print(run.output.grounding)  # [{field, citations:[{url,title}], confidence}]
```

Points clés de l'API (docs officielles à jour sept.–oct. 2026) :

| Paramètre | Effet |
|---|---|
| `effort` | le seul bouton qui compte : `minimal` → `low` → `medium` → `high` → `xhigh` (prix fixe par run) ou `auto`/`ultra` (facturé à l'usage, plafonné) |
| `outputSchema` | JSON Schema que tu fournis ; la réponse dans `output.structured` (ou `output.content`) est **validée** contre ce schéma, champ par champ. Les champs introuvables reviennent `null` même si `required` — c'est voulu pour ne pas inventer. |
| `inputData` | tu lui passes les lignes que tu as déjà (`manques-referentiel.json`) pour enrichir au lieu de repartir de zéro |
| `exclude` | entités à ne pas re-retourner — évite les doublons entre deux runs |
| `previousRunId` | chaîner une question de suivi sans repayer toute la recherche |
| `budget.maxCostDollars` | plafond dur en $ (1 à 100) pour `auto`/`ultra` — au plafond, il s'arrête et rend ce qu'il a |
| `budget.maxDurationSeconds` | `ultra` uniquement, 300 à 10 800 s (5 min → 3 h) — pas de plafond par défaut, donc à poser |

Cycle de vie : `create` → `poll_until_finished` (ou SSE `stream` / `replay`) →
`status` + `stop_reason`. Un `stop()` garde ce qui est collecté et facture
jusque-là.

### L'échelle `effort` — prix 2026 vérifiés

| effort | prix | facturation | usage conseillé par Exa |
|---|---|---|---|
| `minimal` | **0,012 $ / run** | fixe | lookup d'un fait, 1–2 champs |
| `low` | **0,025 $ / run** | fixe | question factuelle étroite |
| `medium` | **0,10 $ / run** | fixe | point de départ standard |
| `high` | **0,50 $ / run** | fixe | recherche dure, plus de citations |
| `xhigh` | **1,00 $ / run** | fixe | complétude > coût/latence |
| `auto` (défaut) | usage réel, **plafond 5 $** | `0,10 $/ACU + 0,005 $/search + 0,02 $/email + 0,07 $/téléphone` | le moteur choisit l'effort |
| `ultra` | usage réel, **plafond 20 $** | mêmes taux qu'`auto` | **list building exhaustif, critères durs à vérifier, milliers de sources** |

`effort="ultra"` est le mode de ta capture : c'est le haut de l'échelle,
introduit le 24–25 septembre 2026. Il **tourne à l'épuisement** : typiquement
~30 min sur une tâche complexe, jusqu'à **3 h** au max. La doc le recommande
quand le coût d'un oubli dépasse le coût d'attendre.

> Un run simple ne coûte pas son plafond. Le plafond n'est qu'un garde-fou.
> Un run qui finit tôt facture moins.

Historique des prix : `/search` passé de 5 $ à **7 $/1 000** en mars 2026,
`instant` resté à **4 $/1 000** ; Agent recut en juillet 2026 (`minimal` ajouté
à 0,012 $, `xhigh` divisé par 2 de 2,00 $ à 1,00 $, ACU à 0,10 $) ; `ultra`
ajouté en sept. 2026.

### Ce qui rend l'Agent différent pour notre cas

- **Schéma = contrat.** Tu déclares `domain, pays, ville, siret, verdict` avec
  `verdict ∈ {present, absent, cannot_verify}` et l'Agent est **obligé de
  distinguer** « j'ai vérifié et c'est absent » de « le site était bloqué donc
  je ne peux pas vérifier ». C'est exactement la faute que notre heuristique
  `.fr` essayait d'éviter à la main.
- **Grounding par champ.** Chaque valeur vient avec ses `citations: [{url,title}]`
  et une `confidence` — auditable, pas une phrase GPT.
- **Déduplication native.** `exclude` + règle d'identité canonique (domaine)
  évitent de recompter `adveo.com` deux fois parce qu'il apparaît avec
  `<1% DISCLOSED` et `100% DISCLOSED`.
- **Asynchrone.** Tu lances, tu pars, tu reviens. Pas de timeout HTTP à 30 s.

## Pourquoi c'est précisément ce qui manque

Le trou est mesuré, pas supposé (`docs/manques-referentiel.md`,
`bench/results/manques-referentiel-2026-11-13.json`) :

```
411 entités nommées absentes du référentiel (34 330 lignes)
  8  zone « France » prouvée
294  sans indice de zone — inconnues (le vrai trou)
109  hors zone déclarée
128  portent une forme de domaine (adveo.com, demos.fr, semna.fr…)
311  appelées une seule fois
occurrences cumulées : 308
```

Les API Sirene / annuaire administratif ne peuvent pas trancher les **294
inconnues** : ce sont majoritairement des noms libres (« Royal Glass », « Gloria
Cales », « Fursan Travel ») dont l'API officielle ne saura rien tant qu'on n'a
pas le SIREN. C'est exactement le travail d'un Agent : partir d'un nom et
retrouver la page d'entreprise, le domaine, la ville, le pays, puis décider si
l'entité entre au référentiel — ou pas.

Point important : **311 n'apparaissent qu'une fois**, total des occurrences
308. Un rattrapage ponctuel suffit — ce n'est pas un flux continu.

## Le coût, chiffré sur nos chiffres — et pourquoi l'Agent change le calcul

### Si on restait en `/search` (pour référence)

| Scénario | Requêtes | `instant` 4 $/1 k | `fast` 7 $/1 k |
|---|---|---|---|
| 1 requête par entité du lot actuel | 411 | 1,64 $ | 2,88 $ |
| + résumé par page | +411 | +0,41 $ | +0,41 $ |
| Lot annuel (4 rattrapages) | 1 644 | 6,58 $ | 11,52 $ |

### En mode Agent — là où est ta capture

Deux façons de lancer, prix très différents :

| Stratégie Agent | Runs | Coût fixe | Coût ultra (plafonné) |
|---|---|---|---|
| **1 run par entité, `minimal`** | 411 | **411 × 0,012 $ = 4,93 $** | — |
| **1 run par entité, `medium`** | 411 | 41,10 $ | — |
| **1 run par entité, `low`** | 411 | 10,28 $ | — |
| **1 seul run `ultra` qui traite les 411 noms d'un coup** | 1 | — | **≤ 20 $ (plafond), typiquement 5–12 $** |
| **1 run `auto` sur les 8 « France prouvée » seules** | 1 | — | ≤ 5 $ |

**Conclusion chiffrée :** le moins cher pour « vider les 294 inconnues » n'est
pas 294 appels `minimal`, c'est **un seul run `ultra` avec un schéma strict et
un plafond à 5 ou 10 $** qui rend un tableau complet avec citations. C'est aussi
le plus auditable — un seul `runId` à archiver avec son `stop_reason`.

À l'échelle du projet, c'est dérisoire — **et c'est justement le piège** : la
règle « zéro euro » n'a pas été écrite parce que le montant était élevé, mais
parce qu'une dépendance facturée à l'appel rend le coût **proportionnel au
succès**. Le jour où le radar voit 100 000 entités nouvelles, la même mécanique
coûte 400 $ en `/search` ou 20 $ en `ultra`.

### Gratuit — ce que tu as vraiment sans carte

Plusieurs sources concordantes (dernière vérif 24 juillet 2026) : **20 $ à
l'inscription + 10 $ chaque mois, sans carte bancaire**. Donc :

- le rattrapage ponctuel des 8 « France prouvée » (1 run `auto`) : **gratuit** ;
- le rattrapage des 294 inconnues (1 run `ultra` plafonné à 10 $) : **gratuit
  le premier mois**, puis dans les 10 $ mensuels ;
- 411 runs `minimal` (4,93 $) : **gratuit** aussi le premier mois.

Mais « gratuit Exa » n'est pas « zéro euro » au sens de la règle du programme :
c'est un crédit offert par un fournisseur, révocable, avec un compteur.

## La contradiction à trancher, posée franchement

Deux règles du projet se heurtent :

1. **« Zéro euro est une règle dure »** — exclut les services facturés à l'appel ;
2. **« assumer le trou plutôt que le masquer »** — or le trou ne se comble pas
   avec les API publiques seules.

Quatre issues :

| Option | Coût | Ce que ça change | Risque |
|---|---|---|---|
| **A. Rien** — publier le trou | 0 € | statu quo documenté | le trou reste ouvert |
| **B. `/search` en lots ponctuels** | ≈ 2 $ / lot | comble les 294 inconnues en une passe manuelle | parsing à la main, entorse à la règle |
| **C. Agent `ultra` en lot ponctuel** | ≤ 20 $ / lot (≤ 10 $ réaliste) | **même chose mais avec schéma + citations par champ** — le plus propre | même entorse, plus dépendance à un run long (30 min) |
| **D. Voie gratuite d'abord** : `recherche-entreprises.api.gouv.fr` + sites publics | 0 € | tranche les 8 prouvées, une partie des 294 | déjà bloquée depuis ce poste (réseau) |

**Recommandation inchangée : D, puis C en dernier recours, jamais en flux.**
Si on utilise l'Agent, ça doit rester **hors du chemin d'exécution** : un script
de rattrapage qu'on lance à la main (`inputData = manques-referentiel.json`,
`outputSchema` strict, `budget.maxCostDollars = 10`, `maxDurationSeconds = 1800`),
qui écrit dans un fichier relu puis chargé à la main dans le référentiel. Si
Exa tombe ou si le compte est fermé, le radar continue de tourner à l'identique.

Ce qui serait inacceptable au regard de tes règles : appeler l'Agent depuis un
collecteur, à chaque événement. Là, le coût devient proportionnel au trafic et
la panne d'Exa devient une panne du radar. L'Agent `auto` par défaut sans
plafond explicite serait la même erreur.

## Ce que je fais maintenant

Rien n'est branché sans ta décision (question posée). Tu as répondu « produit
d'abord » pour la suite du programme — donc après ce cadrage, je repars sur
**rendre visible ce qui est déjà calculé** (fil, inspecteur, rail) plutôt que
d'ajouter des sources.

Les chantiers en attente restent : dossier de reprise (20, en cours), rejeu
historique (3) et bi-temporel des organisations (4) — les deux seuls chantiers
du programme qui ne dépendent d'aucun achat.

## Sources

- Agent overview, effort ladder, `outputSchema`/`grounding`/`inputData`/`budget`,
  exa.ai/docs/reference/agent-api/overview (consulté 2026-11-13) et
  exa.ai/docs/admin/pricing.
- `ultra` ajouté 24–25 sept. 2026, plafond 20 $, durée 300–10 800 s, ~30 min
  typique, subagents parallèles : changelog Exa, MarkTechPost, Cryptopond,
  Superpower Daily, Artiverse, eesel.ai, ai-xblog.com, riseproductive.com
  (toutes sept.–oct. 2026, concordantes).
- Prix `/search` : `instant` 4 $/1 000, `fast`/`auto` 7 $/1 000,
  `contents` 1 $/1 000, `answer` 5 $/1 000, `monitors` 15 $/1 000
  (exa.ai/docs/admin/pricing, vérif oct. 2026 ; hausse 5 $→7 $ en mars 2026
  notée par notes.nicolasdeville.com / recatools.com).
- Agent fixed : `minimal` 0,012 $, `low` 0,025 $, `medium` 0,10 $, `high` 0,50 $,
  `xhigh` 1,00 $ ; metered : `0,10 $/ACU + 0,005 $/search` + enrichissement
  `0,02 $/email, 0,07 $/téléphone` (mêmes sources + crustdata.com, toolso.ai).
- Free tier : **20 $ onboarding + 10 $/mois, sans carte** (refonte 14–24 juil.
  2026, usagepricing.com/blueprint/exa-ai + exa.ai/docs/admin/pricing).
- Cas d'usage « recherche d'entreprise » comme exemple documenté par l'éditeur :
  github.com/exa-labs/company-researcher.
