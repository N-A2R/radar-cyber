# Quarantaine des revendications dark web

Zone de confinement des contenus issus du dark web et des sites de fuite des
rançongiciels. Tout y est **TLP:RED**, jamais républié, jamais exposé.

## Principes

- **`.onion` en quarantaine depuis le 11 novembre** : une page `.onion` dont le
  HTML ne se structure pas y est déposée (`source` = identifiant de la source).
  Auparavant elle était jetée en silence, ce qui rendait 64 sources muettes
  invisibles alors qu'elles répondaient en 200. Le corps est conservé pour
  relecture, jamais publié. Les pages qui se parsent (cartes de revendication)
  produisent des événements, elles ne passent pas par ici.
- **Jamais de dump** : seul le texte de revendication est conservé (`raw_body`),
  plafonné à 400 000 octets par page.
- **Non-republication** : les données ransomware.live sont en usage interne, attribution conservée.
- **Traçabilité** : toute sortie de la quarantaine est une promotion inscrite (`promoted_at`, `promoted_by`).

## Schéma `quarantine_raw`

| Colonne | Rôle |
|---|---|
| `source`, `source_url` | provenance (ransomwatch, ransomware.live, ransomlook…) |
| `groupe`, `org_hint` | groupe revendiquant, organisation supposément visée |
| `claimed_at` | date de la revendication |
| `extracted` jsonb | métadonnées structurées |
| `raw_body` | texte brut (jamais réexposé intégralement : `GET /api/review/queue` en renvoie seulement un extrait de 240 caractères et le titre, sous jeton) |
| `tlp` | `RED` par défaut |
| `content_hash` | dédup `(source, content_hash)` |
| `status` | `pending` → `promoted` |
| `promoted`, `promoted_at`, `promoted_by` | trace de promotion (`auto` ou `analyst:<id>`) |
| `purge_after` | purge à 30 j |

## Collecte

- `apps/api/src/collectors/quarantine.collector.ts` — ransomware.live (poll ≤ 1/30 min, ToS) et ransomwatch.
- `apps/api/src/collectors/ransomlook.collector.ts` — tracker additionnel.
- Tick dédié `QUARANTINE_MS` (30 min par défaut) dans `server.ts`.

## Promotion

`apps/api/src/quarantine/promote.ts`

`matchOrg(hint)` normalise le nom (accents, casse, ponctuation), le domaine et la
ville, puis compare **par jetons entiers** (pas de sous-chaîne : « travel » ne
rapproche plus « Avel »). Seuils de confiance :

| Preuve | Confiance |
|---|---|
| domaine exact | 0,95 |
| sous-domaine | 0,85 |
| site | 0,90 |
| nom exact | 0,90 |
| nom complet par jetons entiers | 0,75 |
| nom court + indice court | 0,70 |
| ville + nom | 0,60 |

`MIN_CONFIDENCE = 0,5`.

`promoteMatches()` balaye les faits `pending` non promus avec un `org_hint`, puis
`UPDATE … SET promoted=true, promoted_at=now(), promoted_by='auto',
status='promoted'`. Elle est **appelée automatiquement** par le tick quarantaine
de `server.ts`.

À la promotion, un événement `ransomware` / `third_party_claim` est créé
(`dedup_key = 'quarantine:' || content_hash`), ce qui déclenche la règle
`ransomware-revendication` → alerte S5.

**Promus au 2026-11-10 (7)** : AMICIO → Amicio, Amplitude Laser, Legrand CRM,
Aéroport de Pau, thalesgroup.com ×2 (Thales DMS), Kenall/Legrand.

## Routes

| Route | Auth | Description |
|---|---|---|
| `GET /api/quarantine?status=&promoted=&source=&limit=` | jeton requis | faits + org rapprochée en mémoire (jamais `raw_body`), champ `review` |
| `GET /api/quarantine/stats` | publique | total, pending non promus, par statut/promotion/source |
| `GET /api/quarantine/queue` | **jeton requis** | file priorisée : score, seau, suggestion, trace, facettes, compteurs |
| `POST /api/quarantine/review` | **protégée** | décision groupée `promote \| reject \| review \| undo` (motif obligatoire au rejet) |
| `POST /api/quarantine/:id/promote` | **protégée** | promotion manuelle (idempotente) |

### File de revue (chantier 3)

Écran **« Revue »** du rail : triage au clavier (`J`/`K`, `X`, `Maj+A`, `P`, `R`,
`M`, `U`, `Échap`). La file est priorisée par un score explicable — chaque règle
appliquée et son poids sont affichés — sur une fenêtre bornée de 2 000 faits
(`RADAR_REVIEW_WINDOW`), avec facettes et filtres.

`GET /api/review/queue` ajoute à chaque ligne `titre` (métadonnée du collecteur,
sinon première ligne non vide du texte brut) et `extrait` (`raw_body` tronqué à
240 caractères) : c'est le contexte nécessaire aux indices de famille `nom`,
qui n'ont ni domaine ni sigle pour guider la décision.

Les décisions sont journalisées dans `extracted->_review` (`{at, by, action,
reason}`), **retiré du champ `extracted` renvoyé** et exposé par un champ `review`
dédié. Pas de migration. `undo` remet en attente un fait rejeté ou revu mais
**ne dé-promeut jamais**.

Détails, mesures et limites : `docs/research/file-de-revue.md`.

Revue en ligne de commande (historique) : `./apps/api/node_modules/.bin/tsx scripts/quarantine-review.mts pending` (fichier présent ; exécution directe observée en échec dans cet environnement sur `import 'pg'` / résolution de dépendance, 2026-11-10). L'écran web la remplace pour l'usage courant.

## Tests

`apps/api/test/quarantine.test.ts` — 9 tests : correspondance domaine/nom/ville
et négatifs, promotion idempotente, `dryRun`, `promoteOne`, routes (401/200),
org exposée.

Chantier 3 : `quarantine-triage.test.ts` (13, score pur), `quarantine-candidates.test.ts`
(6, différentiel du préfiltre dont rattachements positifs), `quarantine-review.test.ts`
(7 en base : ordre, rejet groupé, annulation, promotion sans doublon, journal).
Côté web : `test/render.tsx` (rendu + 18 contrôles clavier) et `test/review-dom.tsx`
(26 interactions jsdom).

## Limites

- L'appariement repose sur `org_hint` tel que publié par la source : une
  orthographe exotique peut échouer.
- `org_hint` n'est pas figé en base : l'org est rapprochée à la lecture. Si
  l'org change de nom, la correspondance peut bouger.
- Le score de tri est une **heuristique lisible, pas un modèle appris** : aucun
  taux de faux positifs n'est mesuré faute de corpus annoté.
- Le journal de revue n'est pas une table d'audit indexée : il vit par fait. Une
  piste d'audit par auteur ou par période demanderait une migration.
