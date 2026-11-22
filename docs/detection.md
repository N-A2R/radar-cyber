# Détection & enrichissement

Deux mécanismes qui donnent du sens au signal : **l'enrichissement** (qu'est-ce
que cet indicateur ?) et **la détection** (est-ce que ça mérite mon attention ?).

## 1. Enrichissement

`apps/api/src/enrich/`

| Module | Rôle | Source |
|---|---|---|
| `whois.ts` | registrar, dates de création/expiration, serveurs DNS, statut | RDAP (`rdap.org`) |
| `dns.ts` | résolution A/AAAA, reverse PTR | DNS over HTTPS (Cloudflare) |
| `certs.ts` | certificats observés sur le domaine | `crt.sh` |
| `score.ts` | score de confiance d'un indicateur (0-100) | calcul local |
| `index.ts` | `enrichIndicator()`, dégradation gracieuse si une source échoue | — |

### Routes

| Route | Description |
|---|---|
| `GET /api/enrich/indicator/:id` | indicateur + enrichment + score (cache 24 h) |
| `GET /api/enrich/domain/:value` | whois + dns + certs sur un domaine libre |
| `GET /api/enrich/events/:id` | événement + indicateurs liés + org liée + enrichment |

**Dégradation** : si RDAP renvoie 403 (rate-limit) ou si `crt.sh` ne répond pas,
la route renvoie les autres sources et liste l'échec dans `errors`. Elle ne
renvoie **jamais** 500 pour une source externe en échec.

### Cache

Table `enrich_cache` (`key`, `value` jsonb, `expires_at`), TTL 24 h. Pas de
dépendance externe.

### Score de confiance

`scoreIndicator({ type, first_seen, sources, sourceConfidence })` → 0-100 :
ancienneté, nombre de sources distinctes, type d'indicateur, confiance de la
source.

## 2. Détection

`apps/api/src/detect/engine.ts`

Un moteur de règles JSON : chaque règle décrit des conditions et produit une
alerte. Les règles sont stockées en base (`detection_rule`), modifiables sans
redéploiement.

### Taxonomie réelle (mesurée)

| Champ | Valeurs |
|---|---|
| `family` | `vuln` · `cti` · `cert_fr` · `cert` · `ransomware` · `presse` |
| `assertion_type` | `ambient_signal` · `technical_indicator` · `confirmed_incident` · `third_party_claim` |
| `confidence` | `A1` (4) · `A2` (3) · `B2` (2) · `C3` (1) |

`min_confidence` d'une règle est un **rang** (0-4) comparé via `confidenceRank` :
`min_confidence: 3` exclut tout ce qui est `C3`.

### Règles de départ

| Règle | Sévérité | Conditions | Volume mesuré |
|---|---|---|---|
| `ransomware-revendication` | 5 | `family=ransomware` ET `assertion_type=third_party_claim` | 101 |
| `incident-confirme` | 4 | `assertion_type=confirmed_incident` | 108 |
| `fuite-donnees` | 4 | `family=cti` + mots `fuite/données/leak/exfiltration` | 4 |
| `avis-cert-fr` | 3 | `family=cert_fr` | 160 |
| `certificat-observé` | 3 | `family=cert` | 18 |
| `presse-cyber` | 2 | `family=presse` | 58 |
| `operateur-critique-vise` | 5 | `org_kind=operateur critique` | 0 (en attente de corrélation) |

**Total : 449 alertes** — une file de tri exploitable, pas des milliers.

### Table `alert`

`id`, `rule_id`, `title`, `severity` (1-5), `status` (`open`/`ack`/`resolved`),
`event_id`, `indicator_id`, `org_id`, `evidence` jsonb, `created_at`,
`updated_at`, `acked_at`, `acked_by`.

Idempotence : `ON CONFLICT (rule_id, event_id)` et `(rule_id, indicator_id)`.

### Routes

| Route | Auth | Description |
|---|---|---|
| `GET /api/alerts?status=&severity=&limit=` | publique | file d'alertes + joins event/indicator/org |
| `GET /api/alerts/stats` | publique | comptes par statut et sévérité |
| `POST /api/alerts/:id/ack` | **protégée** | `status=ack`, qui/when |
| `POST /api/alerts/:id/resolve` | **protégée** | `status=resolved` |

### Moteur

- `evaluateEvent(id)` / `evaluateIndicator(id)` : évaluation unitaire.
- `evaluateAll()` : batch complet (utilisé pour le backfill).
- Les règles sont mises en cache ; `loadRules(true)` force le rechargement.

### Signaux DNS : l'historique devient détection

`apps/api/src/dns/changements.ts` compare **chaque paire consécutive** de
`dns_snapshot` (quatre relevés = trois comparaisons) et écrit les différences
dans `dns_change` avec le vocabulaire des enregistrements : `A`, `MX`, `NS`,
plus les signaux dérivés `hebergeur`, `mx-inconnu`, `registrar`.

| Commande | Effet |
|---|---|
| `pnpm dns:detection` | rapport seul : paires comparées, changements trouvés |
| `pnpm dns:detection -- --appliquer` | écrit les signaux (rejeu sans doublon) |
| `tsx scripts/dns-detection.mts --appliquer --domaine=exemple.fr` | périmètre ciblé |

L'index unique `(previous_snapshot_id, current_snapshot_id, kind)` rend le rejeu
inoffensif. Migration : `db/migrate-200-dns-change-signaux.sql` (renomme les
libellés hérités `ip`/`mx`/`ns` en `A`/`MX`/`NS`).

Critère mesurable : `SELECT count(*) FROM dns_change WHERE kind IN ('A','MX','NS')`
doit être ≥ 30 sur le jeu de test — vérifié par
`test/dns-change-signaux.test.ts`, qui détecte aussi exactement 2 changements A
et 1 MX sur 4 snapshots synthétiques.

## 3. Alertes → tri

La vue `Alerts` (front) est la file de tri : filtres statut/sévérité, tri,
`Ack`/`Resolve`, et enrichissement en un clic sur les alertes rattachées à un
indicateur.

## Limites connues

- **Les événements ne référencent pas encore les indicateurs** (`evidence` n'a
  pas de `indicator_ids`) : la route `/enrich/events/:id` n'a donc rien à
  enrichir tant que le lien n'est pas fait (chantier 4).
- **La corrélation org est faible** : peu d'événements ont un `org_id`, donc les
  règles `org_kind` ne se déclenchent pas encore.
- **Tous les indicateurs sont `C3`** : les règles filtrant sur la confiance ne
  passent que pour les sources qui attribuent une meilleure confiance.
