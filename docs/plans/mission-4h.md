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

### Tâche 1 : Diagnostiquer le trou de collecte 17-20 nov

- [x] Interroger `collector_run` pour lister les exécutions du 17 au 20 nov :
      dates, statut, durée, erreur éventuelle
- [x] Identifier pourquoi rien n'a été collecté pendant l'arrêt du conteneur
      (le service API systemd pointait sur 5433 avec la base Docker éteinte)
- [x] Écrire le constat dans `docs/operations.md` (section « Incident 2026-11-17 »),
      avec les commandes de vérification et la date de reprise effective
- [x] Vérifier que la collecte a bien repris depuis le redémarrage de ce jour :
      compter les nouveaux événements ingérés après 17:49
- [x] Committer avec le message `docs(opérations): incident collecte 17-20 nov consigné`

### Tâche 2 : Rattraper la fraîcheur EPSS

- [ ] Vérifier la date du dernier refresh EPSS :
      `psql "$DATABASE_URL" -tAc "SELECT max(updated_at) FROM epss;"` (colonne à
      adapter au schéma réel — la trouver d'abord dans `db/init.sql`)
- [ ] Lancer `scripts/refresh-epss.mts` avec la vraie DATABASE_URL
- [ ] Re-mesurer : combien de lignes EPSS > 0.30 après refresh
- [ ] Consigner avant/après dans `docs/epss.md`
- [ ] Committer : `feat(epss): refresh réel après le trou de collecte`

### Tâche 3 : Rejouer les agents de rupture sur la fenêtre fraîche

- [ ] Lire `docs/agents-rupture.md` et `apps/api/src/analyse/rupture.ts` pour
      comprendre les 3 détecteurs et leur fenêtre
- [ ] Lancer le rejeu (`scripts/rejouer-moteur.mts` ou l'équivalent rupture)
      sur les 30 derniers jours
- [ ] Consigner le résultat exact (nombre d'alertes par agent) dans
      `bench/results/` au format JSON daté du jour
- [ ] Si toujours 0 alerte : vérifier que la raison structurelle documentée
      tient toujours après les vagues SIRENE (elle est écrite dans
      `docs/fausses-alertes.md` — la confirmer ou l'infirmer, ne jamais la
      réécrire de mémoire)
- [ ] Committer : `mesure(rupture): rejeu post-trou-collecte publié`

### Tâche 4 : La liste de courses — traiter 10 entités manquantes

- [ ] Lire `bench/results/manques-referentiel-2026-11-15.json` et prendre les
      10 premières entités de la cohorte `france` (199 entités)
- [ ] Pour chaque entité : chercher son identité légale via les sources déjà
      branchées (pas d'Exa payant, pas de nouvelle clé API — règle « rien de
      payant ») ; ne JAMAIS inventer un SIREN
- [ ] Ce qui est trouvé va dans un fichier `bench/results/manques-glm-<date>.json`
      au même schéma que le fichier d'origine ; le reste reste non traité
- [ ] Consigner le taux de résolution (x/10) dans le JSON, honnêtement
- [ ] Committer : `feat(référentiel): vague manques GLM — x/10 résolues avec preuves`

### Tâche 5 : Le faux positif de la revue de presse

- [ ] Lire `scripts/triage-sources.mts` et `apps/api/src/collectors/classify.ts`
- [ ] Compter les événements `presse_cyber` admis depuis le 14 nov et vérifier
      un échantillon de 20 : combien sont réellement cyber
- [ ] Publier le taux dans `bench/results/presse-cyber-precision-<date>.json`
- [ ] Si le taux < 90 % : lister les motifs de non-cyber dans le JSON (sans
      toucher au classificateur — cette tâche est une mesure, pas un fix)
- [ ] Committer : `mesure(presse): précision du fil presse_cyber publiée`

### Tâche 6 : Rapport de fin de mission

- [ ] Écrire `bench/results/mission-glm-<date>.md` : récapitulatif des 5
      tâches, chiffres avant/après, ce qui reste
- [ ] Vérifier que `pnpm typecheck` et `bash scripts/verify-all.sh` passent
- [ ] Committer : `docs(mission): rapport 4h GLM publié`
