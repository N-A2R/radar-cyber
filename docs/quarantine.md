# Quarantaine des revendications dark web

Zone de confinement des contenus issus du dark web et des sites de fuite des
rançongiciels. Tout y est **TLP:RED**, jamais républié, jamais exposé.

## Principes

- **Jamais de `.onion`** : l'egress est filtré (prouvé), et la collecte reposerait sur Tor.
- **Jamais de dump** : seul le texte de revendication est conservé (`raw_body`).
- **Non-republication** : les données ransomware.live sont en usage interne, attribution conservée.
- **Traçabilité** : toute sortie de la quarantaine est une promotion inscrite (`promoted_at`, `promoted_by`).

## Schéma `quarantine_raw`

| Colonne | Rôle |
|---|---|
| `source`, `source_url` | provenance (ransomwatch, ransomware.live, ransomlook…) |
| `groupe`, `org_hint` | groupe revendiquant, organisation supposément visée |
| `claimed_at` | date de la revendication |
| `extracted` jsonb | métadonnées structurées |
| `raw_body` | texte brut (jamais réexposé par l'API) |
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
| `GET /api/quarantine?status=&promoted=&source=&limit=` | publique | faits + org rapprochée en mémoire (jamais `raw_body`) |
| `GET /api/quarantine/stats` | publique | total, pending non promus, par statut/promotion/source |
| `POST /api/quarantine/:id/promote` | **protégée** | promotion manuelle (idempotente) |

Revue manuelle : `pnpm exec tsx scripts/quarantine-review.mts pending`.

## Tests

`apps/api/test/quarantine.test.ts` — 9 tests : correspondance domaine/nom/ville
et négatifs, promotion idempotente, `dryRun`, `promoteOne`, routes (401/200),
org exposée.

## Limites

- L'appariement repose sur `org_hint` tel que publié par la source : une
  orthographe exotique peut échouer.
- `org_hint` n'est pas figé en base : l'org est rapprochée à la lecture. Si
  l'org change de nom, la correspondance peut bouger.
