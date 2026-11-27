# Vue d'architecture — radar-serve

Cartographie courte, au 2026-11-25. Procédures : [exploitation.md](exploitation.md) et [operations.md](operations.md). Aucun secret n'est versionné : identifiants et phrases secrètes restent dans des fichiers d'environnement protégés (0600/0640) hors du dépôt.

## Services et machines

| Hôte | Rôle | Points d'entrée |
|---|---|---|
| PC / ThinkBook | Poste de veille et de consultation ; orchestration des sauvegardes, clés et phrase secrète (ne quittent jamais le poste) | `radar-backup.service` + `radar-backup.timer` (03:17, `Persistent=true`) |
| `compute-2` (InstaBox) | PostgreSQL 18 (conteneur `radar-db18`, `127.0.0.1:5433`) + API et collecteurs + rapport hebdomadaire + Tor | `radar-api.service`, `radar-report.timer` (unités système) |
| `compute-hermes` | Front statique et proxy `/api` vers l'API de `compute-2` | `radar-web.service` (`User=jolt`) |
| `compute-3` | Cible de sauvegarde chiffrée hors site | `/data/home/backups/radar` |

Les boxes du plan gratuit s'endorment : `instabox-keepalive@{compute-2,compute-3,compute-hermes}.timer` les réveille avant toute frappe.

## Flux front → API → DB

`sources` → collecteurs (`source.interval_sec`, journal `collector_run`) → PostgreSQL (`event`, `org`, `indicator`) → API Fastify (`/api/*`, port 8080) → coque React Stone (Carte, Action, Sources, Journal ; navigation par hash). `apps/web/serve.mjs` sert `dist/` et proxie `/api` ; aucun Vite au runtime. Les sources `.onion` sortent par Tor SOCKS5 (`127.0.0.1:9050` en service utilisateur, `socks5h://tor:9050` dans le profil Compose `tor`, sans port exposé). La base n'est pas exposée sur le tailnet (ACL).

## Sauvegardes

`backup-remote.sh` ouvre un tunnel SSH (`127.0.0.1:55433` → `5433` sur `compute-2`), appelle `backup-db.sh` (`pg_dump --format=custom --compress=9`, contrôle `pg_restore --list`, SHA-256, rotation de 14 dumps), puis chiffre en AES-256/GPG (`PASSPHRASE_FILE`) avant la copie vers `compute-3` (`OFFSITE`). `OFFSITE` sans chiffrement est refusé. `scripts/restore-verify.sh` restaure dans une base jetable et compte les lignes : c'est la seule preuve d'utilité d'une archive.

## CI

`.github/workflows/ci.yml` (PR, merge queue et nightly ; aucun run sur `push main`) : `contracts`, `api-tests` (8 shards, PostgreSQL 17 jetable), `web-unit`, `playwright`, `sdks-python`, `provenance`, `build`, `socle` (bootstrap depuis zéro, idempotence, base copiée), `supply-chain` (`pnpm audit --prod`, validation Compose/Dockerfiles). Le job agrégateur `verify` échoue si une porte n'est pas verte. Équivalent local : `bash scripts/verify-all.sh`.

## Incidents connus

| Domaine | Constat / conduite |
|---|---|
| Tor | Le `torrc` système exige root ; utiliser `tor-radar.service` (config dédiée, 9050). Premier circuit `.onion` lent (~43 s mesuré) : ne pas conclure à une panne. |
| Collecte | Trou du 16–20 nov 2026 : conteneur DB arrêté à la main, `restart: unless-stopped` ne le relance pas, `ECONNREFUSED` et `collector_run` vide. Reprise le 20 nov 17:55 ; erreurs 429/403 isolées par source. Voir [operations.md](operations.md) « Incident 2026-11-17 ». |
| Alertes | Aucune diffusion sans canal complet (webhook + secret HMAC, Telegram token+chat ou SMTP from/to) ; le flux RSS public reste disponible. Rétention basée sur `observed_at` : un rattrapage peut faire chuter le compteur au redémarrage. |
