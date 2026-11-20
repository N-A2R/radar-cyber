# Mission 4 h GLM — rapport de fin

Date : 2026-11-20 · Branche : `mission/4h-glm` · Plan : `docs/plans/mission-4h.md`

Les 6 tâches du plan sont exécutées et committées une par une. Chaque chiffre
ci-dessous provient d'une requête ou d'un script reproductible référencé dans
`bench/results/` ou dans un doc ; rien n'est estimé.

## Récapitulatif des 5 tâches d'exécution (la sixième est ce rapport)

### Task 1 — Diagnostiquer le trou de collecte 17-20 nov

*Commit : `docs(opérations): incident collecte 17-20 nov consigné`*

- Constat écrit dans `docs/operations.md` (section « Incident 2026-11-17 ») :
  0 événement ingéré entre le 15 nov 23:27 et le 20 nov 17:55 CET.
- Cause racine : `radar-api.service` (systemd, enabled) pointe sur 5433 avec la
  base Docker éteinte — le conteneur avait été arrêté à la main avant les
  reboots et `restart: unless-stopped` ne relance pas un conteneur stoppé à la
  main ; chaque cycle avorte en `ECONNREFUSED`, sans trace dans `collector_run`.
- Reprise effective le 20 nov 17:55:26 (premier `collector_run`) ; le volume
  ingéré après la reprise est un compteur croissant (la collecte a repris
  pendant la rédaction) et n'est pas figé dans ce rapport — état courant :
  `SELECT count(*) FROM event WHERE collected_at >= '2026-11-20 17:49'`.

### Task 2 — Rattraper la fraîcheur EPSS

*Commit : `feat(epss): refresh réel après le trou de collecte`*

| | Avant | Après |
|---|---|---|
| Lignes `epss` | 196 (lignes de test `CVE-2026-99xx`) | **410 485** |
| Scores réels | 0 | 410 289 nouvelles lignes (42 pages, 163 s) |
| Lignes > 0,30 | 0 | **7 189** (7 190 à ≥ 0,30) |

Documenté avant/après dans `docs/epss.md` ; le refresh (`refresh-epss.mts
--apply`) est idempotent et recommandé en quotidien après ~13 h Paris.

### Task 3 — Rejouer les agents de rupture sur la fenêtre fraîche

*Commit : `mesure(rupture): rejeu post-trou-collecte publié`*

- Rejeu `mesure-fausses-alertes.mts` (fenêtre 2026-10-21 → 2026-11-20, 3 instants
  calés, pas 14 j) publié dans `bench/results/rupture-rejeu-2026-11-20.json` :
  **0 alerte émise** (nouvelle-organisation 0, rafale 0, changement-nature 0).
  JSON régénéré le soir même (mission hygiène) — les valeurs ci-dessous sont
  celles du fichier courant ; la commande de rejeu est dans son champ
  `commande`.
- Les trois raisons structurelles de `docs/fausses-alertes.md` sont **confirmées
  sur données**, pas réécrites de mémoire :
  - nouvelle-organisation : référentiel chargé 13→15 nov, âge max 7,15 j contre
    seuil 180 j (23 candidats — champ `candidats30j` du JSON — 0 tirerait) ;
  - rafale : seul combo au seuil = dept 33 × ransomware, 4 récents vs médiane 4
    (sous le double) ;
  - changement-nature : 0 candidat, 23 478 faits vulnérabilité (champ
    `faitsVuln` du JSON).

### Task 4 — Liste de courses : 10 entités manquantes

*Commit : `feat(référentiel): vague manques GLM — 8/10 résolues avec preuves`*

- 10 premières entités de la cohorte `france` (199) de
  `manques-referentiel-2026-11-15.json` traitées, résultat dans
  `bench/results/manques-glm-2026-11-20.json` + script reproductible
  `scripts/manques-glm.mts` + test `apps/api/test/manques-glm.test.ts`.
- **8/10 résolues** (5 haute, 2 moyenne, 1 faible), via registre SIRENE public
  sans clé, tout SIREN recoupé et Luhn vérifié ; jamais inventé.
- Non résolues : `adveo.com`, `Gloria Cales` (raison exacte consignée).
- Spot-check registre du 20 nov : confirmé.

### Task 5 — Le faux positif de la revue de presse (mesure)

*Commit : `mesure(presse): précision du fil presse_cyber publiée`*

- **`presse_cyber` : 0 événement admis depuis le 14 nov** — la famille n'a
  jamais été peuplée : `reclassify-press.mts` jamais lancé avec `--apply` et la
  porte d'admission refuse à l'entrée tout événement classé `presse` depuis le
  10 nov. Mesure reportée sur la population effective : **180 événements `cti`**
  issus des sources presse (`gn-*`, `eco-*`) admis depuis le 14 nov.
- Échantillon déterministe de 20 (graine `echantillon-presse-2026-11-20`,
  reproductible) : **20/20 réellement cyber** — précision **100 %** (15
  incidents réels, 5 thématiques cyber sans incident, 0 non-cyber).
- Publié dans `bench/results/presse-cyber-precision-2026-11-20.json` avec l'é
  chantillon vérifié item par item (titre verbatim + URL + verdict).
- Le classificateur n'a pas été modifié (tâche de mesure).

## Validation globale

- `pnpm typecheck` : vert (API et web).
- `bash scripts/verify-all.sh` : **vert** — « Vérification complète OK »
  (contrat, socle, typechecks, tests API, tests web ×6, build, healthcheck),
  lancé avec `RADAR_TEST_ADMIN_URL='postgres://radar:radar@localhost:5433/postgres'`,
  la variable documentée dans `AGENTS.md`.
- Première passe sans cette variable : échec de l'étape « tests api »
  (`password authentication failed for user radar`) — le défaut de
  `apps/api/test/helpers/testdb.ts` pointe sur 5432, port occupé sur cette
  machine par un autre serveur PostgreSQL. Constat d'environnement
  préexistant, non causé par cette mission ; le défaut 5432 du dépôt est
  laissé inchangé (il reste correct ailleurs).

## Ce qui reste (constaté mesuré, non corrigé)

1. **Les 15 sources `presse-*` sont stériles** : `classifyFamily` retourne
   `sourceFamily='presse'` dans ses deux branches et `generic.ts` rejette toute
   famille `presse` — un article réellement cyber de presse-01net ou
   presse-lemonde-tech est perdu à l'entrée. Chantier de design (que veut-on :
   une famille `presse_cyber` admise, ou le rejet ?), pas un quick-fix.
2. **Le compteur de rejet « presse » est trompeur** : la ventilation du motif
   `presse` depuis le 14 nov (compteur croissant — valeurs non figées dans ce
   rapport) se vérifie par
   `SELECT r.source_id, sum((r.items_rejected->>'presse')::bigint) FROM collector_run r WHERE r.finished_at >= '2026-11-14' AND r.items_rejected ? 'presse' GROUP BY r.source_id ORDER BY 2 DESC` :
   `leak:ransomwatch:posts` domine (titres de revendications sans terme cyber ;
   la source n'est pas morte pour autant — ses événements admis, famille
   `leaks`, se comptent par `SELECT count(*) FROM event WHERE source_id = 'leak:ransomwatch:posts'`),
   devant `leak:ransomware-live:recent-rss` et `leak:ddosecrets:rss`.
   Les revendications vivent par ailleurs dans `quarantine_raw` (ransomware.live
   frais du 20 nov), mais `rejectedBy.presse` n'est pas un volume de presse.
3. **Google News sert des URLs de redirection** `?oc=5`, pas les articles
   sources : la preuve de ce fil est limitée au titre verbatim.
4. **189 entités** de la cohorte `france` restent non traitées (8/10 sur les 10
   premières ; le même script permet la suite).
5. Les agents de rupture émettent toujours 0 alerte pour des raisons
   structurelles confirmées — le chantier reste celui décrit dans
   `docs/fausses-alertes.md` (seuils ou fenêtres à revoir), hors périmètre de
   cette mission de mesure.
