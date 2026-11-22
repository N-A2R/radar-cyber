# Forums publics — mesure reproductible

Mesure exécutée le 2026-11-22T00:48:00.550Z.

**5 forums suivis et 10 messages pertinents** sur 106 messages publics réels relus depuis le corpus gelé du 2026-11-22.

État réel au moment de la capture : 1 673 151 organisations, 312 sources, 26 214 événements (base `postgres://radar:radar@localhost:5432/radar`). Le chantier ajoute une couche de forums à cet état, sans modifier les compteurs existants.

## Définition mesurée

- **Forum suivi** : flux public et gratuit enregistré dans la table `source` avec `family = 'forum'` et `enabled = true`, et effectivement présent dans le corpus relu. Aucun compte, aucun abonnement, aucun service payant.
- **Message pertinent** : message de forum admis par la même fonction que le collecteur (`classifyForumMessage`) : signal cyber du moteur de pertinence partagé, périmètre Nouvelle-Aquitaine (flux thématique NA ou département/préfecture cité dans le texte), et aucune donnée personnelle de victime (courriel, téléphone, nom de victime, date de naissance).
- Les sources grises (discussions communautaires) sont autorisées ; les noms d'auteurs ne sont jamais collectés ni exposés.

## Résultats par flux

| Forum | Messages lus | Messages pertinents |
| --- | ---: | ---: |
| Hacker News — bordeaux discussion | 1 | 1 |
| Hacker News — gironde discussion | 0 | 0 |
| Hacker News — poitiers discussion | 15 | 9 |
| Hacker News — latest discussion | 30 | 0 |
| Let's Encrypt community — latest discussion | 30 | 0 |
| HTTP Archive discuss — latest discussion | 30 | 0 |

Rejets : 88 hors Nouvelle-Aquitaine, 5 sans signal cyber, 3 avec donnée personnelle, 0 vides.

## Contraintes vérifiées

- Nouvelle-Aquitaine uniquement : les flux thématiques sont limités à Bordeaux, Gironde et Poitiers ; les flux généraux n'acceptent un message que s'il nomme explicitement un département ou une préfecture de la région.
- Sources grises autorisées, aucune donnée personnelle de victime, aucun service payant.
- Code et interface en anglais (`/api/forums`, `followedForums`, `relevantMessages`) ; le présent rapport est en français.
- Le diff de `apps/api/src/server.ts` se limite à deux lignes (import et branchement du cycle).

## Reproduction

```bash
pnpm forums:corpus
pnpm mesure:forums -- --json=bench/results/forums-2026-11-22.json --out=docs/rapports/forums-publics-2026-11-22.md
```

La première commande capture les flux publics ; la seconde est hors réseau, ne dure que quelques secondes et recompute exactement les deux chiffres ci-dessus.
