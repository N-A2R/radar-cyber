# Triage des sources muettes — 2026-11-10

Commande : `apps/api/node_modules/.bin/tsx scripts/triage-sources.mts --dry-run` (sondes GET sérielles, 1 par seconde, timeout 5 s, `User-Agent` explicite).

331 sources sans événement sur 30 jours ; 312 sondées en HTTP, 19 déjà désactivées.

| Cause | Sources | Part | Lecture |
| --- | ---: | ---: | --- |
| ok_but_empty | 303 | 92 % | HTTP 200, collectée, 0 item : source vivante, le silence vient du parser ou du filtre de pertinence — **ne pas désactiver** |
| disabled | 19 | 6 % | déjà neutralisées (`enabled = false`), non sondées |
| http_error | 6 | 2 % | 401 / 403 / 404 explicites |
| unreachable | 3 | 1 % | timeout > 5 s ou URL non http |
| never_collected | 0 | 0 % | aucun cas |

Exemples réels : `quarantine:ransomware.live` → HTTP 404 ; `estorides:urlhaus-recent` → HTTP 401 (API urlhaus devenue authentifiée) ; `ctlog` (crt.sh) → timeout ; `actu-cybernews` → HTTP 403 ; `feed:abuse-ch:sslbl-sha256` → timeout ; `estorides:urlhaus-payloads` → HTTP 401.

## Conclusion opérationnelle

- **9 vraies mortes** (6 `http_error` + 3 `unreachable`), candidates à `disabled_at` via `--apply` ; aucune n'est supprimée et `enabled` reste inchangé.
- Les 303 `ok_but_empty` ne sont pas mortes : 116 `reputation`, 106 `cti`, 32 `phishing`, 24 `ransomware`, 20 `malware`, et la presse régionale (`presse-francebleu-rss`, `presse-lmi-feedburner`) qui doit rester pour la veille territoriale. Le rendement perdu est côté extraction, pas côté source.
- Garde-fou : un 403 peut relever du filtrage anti-bot et non d'une mort ; revérifier les 4 sources 403 (`actu-cybernews`, `feed:daniel-austin-mbcs:…`, `feed:dan-me-uk:…`) avant `--apply`.
- `--apply` n'a pas été exécuté. Seul `db/migrate-018-source-triage.sql` a été appliqué (colonnes `disabled_at`/`disabled_reason` + index partiel sur les sources actives, idempotent).
