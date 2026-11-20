# Plan : Mission 4 h — radar-cyber, vague GLM

> Plan exécuté par ralphex, une tâche = une session Claude Code fraîche sur le
> pont zcode (Start Plan GLM-5.3-Flash). Chaque tâche doit finir par un commit
> et un tour de validation. Ne jamais toucher aux fichiers hors du dépôt.
> Ne jamais reformater du code existant (dépôt à indentation mixte : suivre le
> fichier édité).

## Validation Commands

- `pnpm typecheck`
- `bash scripts/verify-all.sh`

### Contexte obligatoire (à lire avant chaque tâche)

- `AGENTS.md` — conventions du dépôt (commentaires en français, `any` interdit)
- `docs/programme.md` — la doctrine : mesure publiable, rien de faux
- Les chiffres qu'on publie viennent de requêtes reproductibles, jamais d'estimation

### Contexte d'infrastructure (vérifié le 20 nov)

- La base de dev vit dans Docker : `docker compose up -d db` (port 5433).
  `DATABASE_URL=postgres://radar:radar@localhost:5433/radar`
- L'API tourne en systemd user : `radar-api.service` (port 8080)
- Vérifier la fraîcheur des données avant tout diagnostic :
  `psql "$DATABASE_URL" -tAc "SELECT max(created_at) FROM event;"`
- 21 264 événements, 1 244 048 organisations, dernier event 17 nov (trou de
  collecte du 17 au 20 lié à l'arrêt du conteneur — à documenter, pas à masquer)

### Task 1 : Diagnostiquer le trou de collecte 17-20 nov

- [x] Interroger `collector_run` pour lister les exécutions du 17 au 20 nov :
      dates, statut, durée, erreur éventuelle
- [x] Identifier pourquoi rien n'a été collecté pendant l'arrêt du conteneur
      (le service API systemd pointait sur 5433 avec la base Docker éteinte)
- [x] Écrire le constat dans `docs/operations.md` (section « Incident 2026-11-17 »),
      avec les commandes de vérification et la date de reprise effective
- [x] Vérifier que la collecte a bien repris depuis le redémarrage de ce jour :
      compter les nouveaux événements ingérés après 17:49
- [x] Committer avec le message `docs(opérations): incident collecte 17-20 nov consigné`

### Task 2 : Rattraper la fraîcheur EPSS

- [x] Vérifier la date du dernier refresh EPSS :
      `psql "$DATABASE_URL" -tAc "SELECT max(updated_at) FROM epss;"` (colonne à
      adapter au schéma réel — la trouver d'abord dans `db/init.sql`)
      → schéma réel = migration 021 : avant, 196 lignes de test, 0 score réel
- [x] Lancer `scripts/refresh-epss.mts` avec la vraie DATABASE_URL
      → --apply : 410 485 CVE en 163 s, 410 289 nouvelles lignes
- [x] Re-mesurer : combien de lignes EPSS > 0.30 après refresh
      → 7 189 lignes > 0,30 (7 190 à >= 0,30) sur 410 485
- [x] Consigner avant/après dans `docs/epss.md`
- [x] Committer : `feat(epss): refresh réel après le trou de collecte`

### Task 3 : Rejouer les agents de rupture sur la fenêtre fraîche

- [x] Lire `docs/agents-rupture.md` et `apps/api/src/analyse/rupture.ts` pour
      comprendre les 3 détecteurs et leur fenêtre
      → fait ; l'instrument de rejeu rupture est `scripts/mesure-fausses-alertes.mts`
      (rejouer-moteur.mts est le rejeu du moteur de rattachement, pas la rupture)
- [x] Lancer le rejeu (`scripts/rejouer-moteur.mts` ou l'équivalent rupture)
      sur les 30 derniers jours
      → fenêtre 2026-10-21 → 2026-11-20, 3 instants calés depuis la fin ;
      `--depuis/--jusqua/--pas` ajoutés à mesure-fausses-alertes.mts
- [x] Consigner le résultat exact (nombre d'alertes par agent) dans
      `bench/results/` au format JSON daté du jour
      → `bench/results/rupture-rejeu-2026-11-20.json` : 0 alerte émise
      (nouvelle-organisation 0, rafale 0, changement-nature 0)
- [x] Si toujours 0 alerte : vérifier que la raison structurelle documentée
      tient toujours après les vagues SIRENE (elle est écrite dans
      `docs/fausses-alertes.md` — la confirmer ou l'infirmer, ne jamais la
      réécrire de mémoire)
      → les trois confirmées sur données (vérification rejouée dans le JSON,
      consignée dans `docs/fausses-alertes.md`, section 20 nov) : référentiel
      chargé 13→15 nov (âge max 7 j contre seuil 180 j) ; rafale dept 33 ×
      ransomware 4 récents vs médiane 4 (sous le double) ; 0 candidat saut de
      gravité, 23 472 faits vuln
- [x] Committer : `mesure(rupture): rejeu post-trou-collecte publié`

### Task 4 : La liste de courses — traiter 10 entités manquantes

- [x] Lire `bench/results/manques-referentiel-2026-11-15.json` et prendre les
      10 premières entités de la cohorte `france` (199 entités)
      → les 10 premières traitées dans l'ordre du fichier
- [x] Pour chaque entité : chercher son identité légale via les sources déjà
      branchées (pas d'Exa payant, pas de nouvelle clé API — règle « rien de
      payant ») ; ne JAMAIS inventer un SIREN
      → registre SIRENE public (recherche-entreprises.api.gouv.fr, sans clé) +
      site de l'entité quand la revendication porte un domaine ; tout SIREN
      recoupé au registre, Luhn vérifié
- [x] Ce qui est trouvé va dans un fichier `bench/results/manques-glm-<date>.json`
      au même schéma que le fichier d'origine ; le reste reste non traité
      → `bench/results/manques-glm-2026-11-20.json` + `scripts/manques-glm.mts`
      (reproductible, dry-run possible) + `apps/api/test/manques-glm.test.ts`
- [x] Consigner le taux de résolution (x/10) dans le JSON, honnêtement
      → 8/10 (5 haute, 2 moyenne, 1 faible) ; adveo.com et Gloria Cales non
      résolues avec la raison exacte ; spot-check registre du 20 nov confirmé
- [x] Committer : `feat(référentiel): vague manques GLM — 8/10 résolues avec preuves`

### Task 5 : Le faux positif de la revue de presse

- [x] Lire `scripts/triage-sources.mts` et `apps/api/src/collectors/classify.ts`
- [x] Compter les événements `presse_cyber` admis depuis le 14 nov et vérifier
      un échantillon de 20 : combien sont réellement cyber
      → presse_cyber : 0 admis depuis le 14 nov (jamais peuplée : reclassify-press
      jamais appliqué, porte refuse presse à l'entrée depuis le 10 nov) ; mesure
      portée sur la population effective = 180 événements `cti` des sources presse
      (gn-*, eco-*) ; échantillon déterministe de 20 → 20/20 réellement cyber
      (15 incidents, 5 thématiques), précision 100 %
- [x] Publier le taux dans `bench/results/presse-cyber-precision-<date>.json`
      → `bench/results/presse-cyber-precision-2026-11-20.json` (échantillon
      vérifié item par item, graine reproductible)
- [x] Si le taux < 90 % : lister les motifs de non-cyber dans le JSON (sans
      toucher au classificateur — cette tâche est une mesure, pas un fix)
      → taux ≥ 90 % : branche non déclenchée ; observations structurelles
      consignées (15 sources `presse-*` stériles, compteur de rejet « presse »
      dominé par leak:ransomwatch:posts — 37 941 rejets, 0 admis)
- [x] Committer : `mesure(presse): précision du fil presse_cyber publiée`

### Task 6 : Rapport de fin de mission

- [ ] Écrire `bench/results/mission-glm-<date>.md` : récapitulatif des 5
      tâches, chiffres avant/après, ce qui reste
- [ ] Vérifier que `pnpm typecheck` et `bash scripts/verify-all.sh` passent
- [ ] Committer : `docs(mission): rapport 4h GLM publié`
