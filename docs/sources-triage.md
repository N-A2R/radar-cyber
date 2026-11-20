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

---

## Triage Telegram — 2026-11-17

Sondage des 24 sources `tg-*` : `GET https://t.me/s/<canal>`, `User-Agent`
explicite, une requête par seconde, comptage des blocs
`tgme_widget_message_wrap`, lecture de `og:title` pour confirmer l'identité du
canal. Croisé avec ce que le collecteur a réellement parsé (`source.items_total`,
`collector_run`).

| Constat | Sources | Décision |
| --- | ---: | --- |
| Parse et ingère (9 à 20 items) | 13 | inchangées |
| 200, 0 item — aperçu fermé ou filtre | 10 | **restent actives** (`ok_but_empty`) |
| Handle réutilisé (`IntelOwl` → « Ralf ») | 1 | désactivée, motif enregistré |
| `kind='quarantine'` et aucun collecteur ne les lit | 5 | désactivées, câblage à arbitrer |

Les cinq canaux ransomware mesurés vivants (BaseLeak, Leaked Databases, Marketo
Leaked Data, BLACKNET-00, Snatch Team) sont dans la file de quarantaine mais
invisibles : la boucle générique exclut `kind = 'quarantine'`, et
`collectors/quarantine.collector.ts` ne connaît que `quarantine:ransomware.live`.
Leur passage en `narrative` ferait entrer des revendications non vérifiées
directement dans `event` — contre la doctrine « rien de faux ». Décision laissée
à l'utilisateur.

**Arbitrage (2026-11-17, même jour)** : l'utilisateur a tranché pour le passage
en `narrative` — compromis assumé, voir `db/sources-telegram-narrative.sql`.
Les cinq canaux sont donc actifs en sources narratives ; le fichier de triage
`db/sources-telegram-triage.sql` ne les touche plus, les deux fichiers sont
rejouables dans n'importe quel ordre.

**Leçon de méthode** : un `GET` à 0 message ne prouve pas qu'une source est
morte. `tg-cti` avait été classé « aperçu fermé » sur ce seul critère alors que
le journal montrait 39 items parsés le même jour, écartés par le filtre de
pertinence. Le triage se fait sur `items_total` + `collector_run`, pas sur une
sonde isolée. Fichier appliqué : `db/sources-telegram-triage.sql`.
