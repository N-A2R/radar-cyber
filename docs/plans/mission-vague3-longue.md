# Plan : Vague 3 longue — cinq heures de fermeture méthodique

> Objectif : **5 heures de travail utile**, pas 5 heures de remplissage. Le plan
> est dimensionné sur le rythme mesuré de la nuit (Task 0 → Task 9 en 1 h 36,
> dont beaucoup de tâches documentaires ; ici tout est du travail de données).
>
> Rythme de référence, mesuré : **~13 min par lot de 10 entités**, **~2 min par
> source dépouillée**, **~30 min par phase de code + tests**.
>
> Budget : **300 minutes**. Chaque tâche porte le sien. À mi-parcours, si le
> budget est dépassé de plus de 30 %, **le dire dans le rapport** et aller au
> bout des tâches 1 à 3 avant de toucher aux suivantes.

## Baseline mesurée au départ (2026-11-21)

| Mesure | Valeur | Requête / source |
|---|---|---|
| Sources activées | **191** | `SELECT count(*) FROM source WHERE enabled` |
| Événements NA (12 depts) | **29** | jointure `event` × `org` |
| Départements à zéro | **40, 47, 23, 19** | `na-audit-2026-11-21.json` |
| Sources muettes, toutes régions | **101** | `na-audit-2026-11-21.json` |
| Sources NA muettes | 13 (dont 10 nouvelles) | idem |
| Entités vague 2 restantes | **149 / 169** | `manques-glm-vague2.json` |
| Propositions de rattachement ≥ 0,5 | **4** : BUILD, AMAROK, SCI CHEVRON, GROUPE ALTERNANCE | rapport de nuit |

## Doctrine

Rien de faux, rien de lisible à moitié, rien de payant, mesure publiable. Un
SIREN non vérifié n'est pas publié. Un chiffre sans requête n'est pas écrit. Un
extrait se copie, il ne se reformule pas. Une source muette se documente avec son
motif — elle ne se maquille pas avec du vide.

---

## Task 1 — Les 149 entités restantes · budget 90 min

Méthode éprouvée : `tsx scripts/lot-reprise-na.mts --lot=N`, un commit par lot.

- [x] Lots restants, par lots de 10 (≈ 15 lots)
- [x] Chaque entité : site → mentions légales → registre
      (`recherche-entreprises.api.gouv.fr`) → preuve verbatim
- [x] **Trois tentatives maximum** par entité, puis `nonResolues` avec sa raison
- [x] Les 4 en arbitrage humain (ch-sf.fr, Chu De Rennes, coteg-azam.fr,
      homonymies du lot 1) : trancher avec preuve ou documenter le doute
- [x] Commit par lot ; clôture avec `cohorte.traitees == 199` et le taux publié

**Critère :** le taux global est arithmétiquement vérifiable en une commande.

## Task 2 — Les 101 sources muettes · budget 100 min

Par lots de 25, quatre lots.

- [x] `scripts/source-health.mts --json` → la liste, avec son âge
- [x] Chaque source : fetch réel, code HTTP, date du dernier item, motif parmi
      `parse-casse` / `vide-legitime` / `format-change` / `bloque-externe`
- [x] **`parse-casse`** : démonstration faite qu'il n'y en a pas (chaque source
      200 OK a ses items décodés puis rejetés par la porte, motif consigné)
- [x] Morte depuis > 30 j : désactiver **en journalisant** (`kind` du journal),
      jamais de désactivation silencieuse — 5 désactivées, `source.changed`
- [x] Publier `bench/results/sources-muettes-vague3.json` (lot par lot)
- [x] Commit par lot

**Critère :** 101/101 classées, aucune sans motif. Au moins 5 réparations
prouvées, ou la démonstration qu'il n'y en a pas.

## Task 3 — Les 4 départements vides · budget 30 min

Le rapport de nuit a établi que les fils **généralistes** n'y portent aucun
incident cyber. Ne pas en rajouter.

- [x] Pour 40, 47, 23, 19 : chercher des sources **d'incident** (faits divers
      cyber de la presse locale, préfectures, ARS, collectivités, CCI)
- [x] Fetch réel de chacune, et contenu vérifié : publie-t-elle des incidents ?
      — incidents NA prouvés dans les flux existants (Tarnos, Altillac,
      Stade Montois, mairies du 47)
- [x] Verdict : rien à câbler — sources d'incident déjà en place
      (gn-40/47/23/19), candidats testés écartés avec preuve
      (`bench/results/sources-incidents-4depts-vague3.json`) ; le trou réel est
      le rattachement (org_id null), pas les sources
- [x] Commit : `feat(sources): sources d'incident pour les 4 départements vides`

## Task 4 — Les 4 propositions de rattachement · budget 20 min

- [x] BUILD, AMAROK, SCI CHEVRON, GROUPE ALTERNANCE : identité réelle vérifiée
- [x] Juste → promouvoir et journaliser (GROUPE ALTERNANCE, preuve registre +
      site vivant). Faux → documenter (AMAROK, SCI CHEVRON, BUILD : homonymes
      américains/immobiliers vérifiés au registre), et proposer la règle qui
      l'aurait évité sans casser les rattachements valides
      (`bench/results/rattachements-tranches-vague3.json`)
- [x] Commit : `mesure(na): les 4 propositions de rattachement tranchées`

## Task 5 — `gn-ransom-aquitaine` · budget 15 min

0 item en 7 jours.

- [x] Vérifier à la main : URL, HTTP, contenu, date du dernier item
- [x] Vivante → réparer le parser et prouver — la requête portait
      « rancongiciel » sans cédille (0 item sur 1 an) ; corrigée, preuve
      avant/après publiée, journalisée (`source.changed`)
- [x] Commit : `fix(sources): gn-ransom-aquitaine vérifiée`

## Task 6 — Vue web, un cran plus loin · budget 25 min

- [x] Fil d'événements lisible par département (source, date, organisation,
      famille) — `/api/na/events?dept=NN`, 50 derniers, dept en liste blanche
- [x] Indicateur de fraîcheur : « dernière collecte il y a X » — calculé
      (`ilYA`) depuis `derniereCollecte` de `/na/overview`, jamais inventé
- [x] Organisation cliquable sans perdre le filtre `?naDept=`
      (`#/na?org=1&naDept=33`, vérifié en test)
- [x] Étendre `test:na`, `verify-all.sh` vert — 31 contrôles (18 → 31),
      15/15 étapes OK ; au passage verify-all charge `.env` (les tests API
      dérivaient d'un 5432 par défaut erroné)
- [x] Commit : `feat(web): parcours département → événement → organisation`

## Task 7 — Collecte continue, mesurée sur 24 h · budget 10 min

- [x] `radar-api.service` et `radar-report.timer` en `active`
- [x] Passages de collecte sur 24 h, items nouveaux, erreurs par source —
      1 895 passages, 20 968 items nouveaux, 603 passages en erreur
      (`bench/results/collecte-continue-vague3.json`)
- [x] Prouver qu'un échec de source n'arrête pas les autres — même minute :
      11-18 autres sources OK pendant chaque échec ; `nvd_cve` ajoute 16 798
      items malgré ses 429
- [x] Commit : `docs(ops): état de la collecte continue, mesuré`

## Task 8 — Rapport · budget 10 min

- [ ] `docs/rapport-vague3-2026-11-21.md` : baseline, avant/après, temps réel
      par tâche, ce qui reste ouvert et pourquoi
- [ ] `pnpm typecheck` + `bash scripts/verify-all.sh`
- [ ] `git status` propre (hors `AGENTS.md`, `.claude/`)
- [ ] Commit : `docs(mission): rapport vague 3 publié`

## Arrêt

Budget total : **300 minutes**. Écrire `MISSION-COMPLETE` quand les huit tâches
sont cochées ou explicitement documentées comme impossibles. **Ne pas enchaîner
sur autre chose** : produire du travail non demandé est une faute, pas une
qualité.
