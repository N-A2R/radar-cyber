# Recherche en langage naturel — Nouvelle-Aquitaine

## Objectif mesurable

Répondre en moins de 2 s à : **« quelles attaques ont touché les hôpitaux de Gironde en 2026 »**.

## Résultat mesuré

**p95 = 91,34 ms** (p50 = 51,86 ms · max = 91,34 ms) sur 11 mesures chronométrées, après 2 échauffements, sur le corpus réel : **1 673 151 organisations, 26 259 événements, 312 sources**. Objectif : 2 000 ms. **Atteint**, avec une marge d'un facteur 21,9.

Brut : `bench/results/NA-natural-search.json`.

Commande reproductible (base réelle, lecture seule, aucune commande au-delà de 55 s) :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx apps/api/scripts/measure-natural-search.mts \
  --json=bench/results/NA-natural-search.json
```

La sonde appelle `GET /api/search/ask` par `Fastify.inject` (aucun réseau), vérifie à chaque répétition le filtre (`Gironde` → `33`, `2026`, intention attaques, secteur santé), les quatre résultats attendus et l'absence de champ de donnée personnelle. Elle échoue si le p95 dépasse 2 000 ms.

## Réponse obtenue

> 4 healthcare cyberattacks in 2026 found in the Nouvelle-Aquitaine corpus (4 from the versioned incident corpus, 0 from live events).

| Date | Organisation | Fait | Source |
| --- | --- | --- | --- |
| 2026-07-08 | ARS Nouvelle-Aquitaine — plateforme d'autorisations parentales (prestataire SYADEM) | fuite | ARS Nouvelle-Aquitaine (communiqué officiel) |
| 2026-06-15 | SYADEM SAS — MesVaccins.net (Bordeaux) | fuite | TICsanté |
| 2026-04-06 | Ymed SAS — plateforme SoonCare, utilisée par des établissements de santé | fuite | Sud Ouest |
| 2026-03-03 | Dedalus HealthCare France — solution BIOSERVEUR (Artigues-près-Bordeaux) | fuite | Dedalus France (communiqué officiel) |

Ces quatre faits sont des attestations **au niveau organisation** : aucune identité de victime, aucun extrait d'article et aucun champ de synthèse susceptible d'en contenir n'est transmis par l'API. Le corpus vivant (`event`) ne porte pas d'événement explicitement nommé « hôpital de Gironde » en 2026 : le résultat vient donc du corpus d'incidents figé et sourcé, et le rapport le dit explicitement plutôt que de présenter les événements techniques (`vuln`, `cti`) comme des attaques d'hôpitaux.

## Méthode

1. `apps/api/src/search/parse-question.ts` : parseur déterministe et hors ligne. Il extrait le département (noms et codes INSEE de Nouvelle-Aquitaine uniquement), l'année, l'intention (attaques / vulnérabilités) et le secteur (santé, enseignement, public). Français et anglais ; aucun appel réseau, aucun service payant.
2. `apps/api/src/search/answer-question.ts` : une requête SQL bornée (`event` joints à `org`, département, fenêtre annuelle, familles d'attaque, secteur ou mots-clés de santé, limite 50) et le corpus figé, interrogés en parallèle. Réponse structurée en anglais : filtres compris, liste de faits sourcés, compteurs, durée.
3. `apps/api/src/search/frozen-incidents.ts` : lecture de `bench/corpus/incidents-*.jsonl`, filtrage Nouvelle-Aquitaine et liste blanche de champs. Les champs `extrait`, `resume`, `confiance` et tout autre champ libre sont écartés à la lecture.
4. `apps/api/src/routes/ask.ts` : route publique `GET /api/search/ask?q=...`, enregistrée dans le registre unique des routes et déclarée dans la matrice d'accès. `apps/api/src/server.ts` n'a pas été modifié (**0 ligne**).

## Vérifications

- 19 tests dédiés, un comportement par test : parseur (8), corpus figé (6), route et absence de donnée personnelle (5).
- 30 tests passing via le lanceur de suite, y compris la couverture d'accès des routes et la matrice RBAC.
- `tsc --noEmit` sans erreur sur `apps/api`.
- Toutes les commandes de mesure et de test ont été bornées à 55 s ; la sonde complète s'exécute en 2,1 s.

## Limites assumées

- Le parseur est lexical, pas sémantique : il comprend les tournures françaises et anglaises courantes, pas les paraphrases indirectes (« établissements de soins » est couvert, une métaphore ne l'est pas).
- Les résultats « live events » sont volontairement restrictifs : un événement technique avec le mot « medical » dans un résumé n'est pas présenté comme une attaque d'hôpital sans rattachement géographique et sectoriel.
- Les sources grises restent autorisées telles quelles (presse régionale, communiqués officiels, sources CTI) ; leur provenance est conservée dans chaque résultat.
OBJECTIF : atteint — 28,75 ms / 2 000 ms (p95 rejouée le 22/11/2026 avec `DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx apps/api/scripts/measure-natural-search.mts --json=/tmp/na-natural-search-verify.json`, 2 échauffements et 11 mesures sur 1 673 220 organisations ; mesure initiale 91,34 ms ; aucun code ni test modifié).
