# Modèle de décision — `mercury-decide`

Un modèle de décision typé, disponible sur ce projet, branché à deux endroits.
Ce document existe pour qu'on ne le redécouvre pas : il n'est pas évident,
il n'apparaît pas dans le code métier, et il change la façon de trancher les cas
ambigus.

## Ce que c'est

`mercury-decide` ne produit pas de texte. On lui donne un **état** et des
**questions typées**, il rend une **distribution de probabilités** par question.

| Élément | Valeur |
|---|---|
| Endpoint | `POST https://api.inceptionlabs.ai/v1/decisions` |
| Modèle | `mercury-decide` |
| Clé | `INCEPTION_API_KEY` puis `~/.omp/agent/inception*.key` (rotation) |
| Délai | 4 s par tentative, au-delà on abandonne |
| Coût observé | ~100 jetons d'entrée par question |

**Rotation de clés.** L'API plafonne le débit par clé (HTTP 429). Le client
(`apps/api/src/detect/decision.ts`) lit les clés disponibles — celle du service
puis celles enregistrées pour omp — et passe à la suivante sur 429. Il retient
ensuite celle qui a répondu, pour ne pas repayer l'erreur à chaque appel.
Trois clés sont présentes sur cette machine : vérifié par
`decisionApiKeys().length === 3`.

Les services systemd chargent ce fichier automatiquement. Pour un script lancé
à la main, il faut l'exporter :

```bash
set -a; . ~/.config/radar-cyber/env; set +a
pnpm -F @radar/api exec tsx ../../scripts/...
```

Trois types de question :

| Type | Réponse | Usage ici |
|---|---|---|
| `noul` | probabilité dans `[0,1]` | « ce texte parle-t-il de cybersécurité ? » |
| `choice` | une option + `probabilities` + `confidence` | « quelle organisation ce texte désigne-t-il ? » |
| `score` | valeur ordinale | non utilisé |

Exemple réel, vérifié le 10 novembre 2026 :

```bash
curl -s -X POST https://api.inceptionlabs.ai/v1/decisions \
  -H "Authorization: Bearer $INCEPTION_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"mercury-decide",
       "state":{"message":"Le CHU de Poitiers a subi une attaque par rançongiciel."},
       "questions":{"organization":{"type":"choice",
         "instructions":"Quelle organisation ce texte désigne-t-il ?",
         "criteria":{"org_1":"CHU de Bordeaux","org_2":"CHU de Poitiers","org_3":"Université de Poitiers"}}}}'
```

```json
{"answers":{"organization":{"type":"choice","choice":"org_2",
  "probabilities":{"org_1":0.0001,"org_2":0.99978,"org_3":0.0001},
  "confidence":0.99968}}}
```

## Où il est branché

| Fichier | Rôle | Seuil |
|---|---|---|
| `apps/api/src/detect/scope.ts` | Porte régionale : un événement est-il `REGIONAL`, `NATIONAL` ou `MONDE` ? | `SCOPE_CONFIDENCE_THRESHOLD = 0.9` |
| `apps/api/src/match/decide.ts` | Arbitrage de rattachement : quelle organisation parmi les candidats à égalité ? | `ARBITRATION_CONFIDENCE_THRESHOLD = 0.9` |

## Les quatre règles

1. **Jamais seul.** Les deux appelants ont d'abord une règle déterministe. Le
   modèle ne tranche que ce que la règle laisse ouvert.
2. **Seuil, pas confiance aveugle.** Sous 0,9, la décision est ignorée et le
   comportement déterministe reprend : `null`.
3. **Aucune exception.** Réseau coupé, quota, clé absente, réponse inattendue :
   `null`. Le fil ne s'arrête jamais à cause du modèle.
4. **Sans clé, désactivé.** `isScopeGateEnabled()` et `chooseOrganization`
   testent la présence de la clé. Pas de clé, pas d'appel, comportement
   d'origine intact.

## Où l'utiliser ensuite

- **Rattachement (phase 1)** : aujourd'hui l'arbitrage ne se déclenche que sur
  ambiguïté stricte. L'étape suivante est de l'appeler sur les événements sans
  correspondance, avec des candidats proposés par recouvrement de jetons.
- **Pertinence (phase 0)** : la porte de collecte est déterministe
  (`collectors/relevance.ts`). Un `noul` sur les items frontière remplacerait
  la liste de mots-clés.
- **Sévérité** : un `score` sur l'impact réel, plutôt que le CVSS recopié.

## Ce qu'il ne faut pas en attendre

Ce n'est pas un modèle de langage : il ne résume pas, n'extrait pas d'entités
et n'écrit pas de texte. Pour ces tâches, voir les collecteurs et
`docs/research/enrichment.md`.
