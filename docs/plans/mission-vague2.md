# Plan : Mission vague 2 — radar-cyber, remplir 4-5 h de travail agent

> Suite directe de `mission-4h.md` (vague 1). Même discipline : une tâche =
> une session fraîche, critère de sortie vérifiable, commit, case cochée.
> Quota GLM mesuré : ~23 M tokens/h → cette vague vise ~110-130 M (~4-5 h).
> Règle absolue : ne jamais inventer un SIREN, un score ou un chiffre ;
> chaque nombre publié vient d'une requête reproductible.

## Validation Commands

- `pnpm typecheck`
- `bash scripts/verify-all.sh`
- `DATABASE_URL=postgres://radar:radar@localhost:5433/radar`

### Contexte obligatoire

- `AGENTS.md` (conventions), `docs/programme.md` (doctrine « mesure publiable »)
- `bench/results/manques-referentiel-2026-11-15.json` : 500 entités manquantes,
  dont 199 en France (champs : nom, nomLisible, zone, provenance, sources,
  familles, voie). Prendre les entités **non encore traitées** par la vague 1
  (vérifier `bench/results/manques-glm-*.json` d'abord).
- `scripts/source-health.mts` classe les sources : muettes / faibles / saines /
  dormantes. Les muettes = collectées récemment mais 0 événement sur la fenêtre.

### Task 1: Liste de courses — lots d'entités françaises (19 lots)

Traiter les 199 entités `zone=france` restantes par lots de 10. Pour chaque
entité : chercher l'identité légale via sources gratuites déjà branchées
(societe.com, pappers, annuaire-administratif, Wikipedia sourcée) ; noter
`present` (avec preuve), `absent` (preuve que non-français) ou
`cannot_verify` (site inaccessible — jamais répondre absent sans preuve).

- [ ] Lot A : entités 11-20 de la cohorte france
- [ ] Lot B : entités 21-30
- [ ] Lot C : entités 31-40
- [ ] Lot D : entités 41-50
- [ ] Lot E : entités 51-60
- [ ] Chaque lot : appender `bench/results/manques-glm-vague2.json` (schéma du
      fichier vague 1), commit `feat(référentiel): vague 2 — lot X/10 résolu`
- [ ] Fin de tous les lots : taux global de résolution publié dans le JSON

### Task 2: Sources muettes — diagnostic par lots de 25

Les ~303 sources muettes répondent 200 sans rien produire. Pour chaque lot :

- [ ] Lister 25 sources muettes via `scripts/source-health.mts --json`
- [ ] Pour 5 sources du lot : fetch réel, analyser pourquoi rien ne sort
      (parse cassé, contenu vide, format changé, anti-bot)
- [ ] Classifier : `parse-casse` / `vide-legitime` / `format-change` /
      `antibot` / `mort`
- [ ] Pour les `parse-casse` : réparer le parser correspondant
      (`apps/api/src/collectors/`), tester sur un fetch réel
- [ ] Publier le bilan du lot dans `bench/results/sources-muettes-vague2.json`
      et commit `fix(collectors): vague 2 — lot sources muettes, x réparées`
- [ ] Répéter jusqu'à couvrir 100+ sources ou épuiser le lot diagnostiqué

### Task 3: Quarantaine .onion — réparer les pages illisibles

- [ ] Lister les 45 pages `.onion` en quarantaine :
      `SELECT source, url, reason FROM quarantine_raw WHERE source LIKE 'onion:%';`
- [ ] Grouper par motif d'échec (les 4 motifs de `docs/sources-diagnostic.md`)
- [ ] Pour le motif dominant : proposer un fix parser, tester sur 5 pages réelles
- [ ] Journaliser les transitions (règle du journal de vérité : rien de destructif)
- [ ] Commit `fix(parsers): quarantaine .onion — motif dominant réparé`

### Task 4: Précision presse_cyber — mesure puis correction si < 90 %

- [ ] Si la vague 1 (Tâche 5) a mesuré < 90 % : prendre les 20 faux positifs
      listés, extraire les motifs communs
- [ ] Proposer un ajustement du classificateur
      (`apps/api/src/collectors/classify.ts`) — règle supplémentaire, pas de
      réécriture
- [ ] Re-mesurer sur le même échantillon : avant/après dans le JSON
- [ ] Si ≥ 90 % à la vague 1 : tâche = re-mesure sur un échantillon frais de
      20 nouveaux événements, publier les deux taux
- [ ] Commit `mesure(presse): précision post-ajustement publiée`

### Task 5: Re-classification du corpus historique

- [ ] Compter les événements `cti`/`vuln` antérieurs à l'assainissement du
      10 nov encore en base (la requête est dans `docs/programme.md`)
- [ ] Rejouer le classificateur actuel dessus (fenêtre test, pas d'écriture
      destructive — tout passe par le journal)
- [ ] Publier le delta : combien reclassés cyber / presse / hors-sujet
- [ ] Commit `mesure(corpus): re-classification historique publiée`

### Task 6: Rapport de vague

- [ ] `bench/results/mission-vague2-<date>.md` : par tâche, chiffres
      avant/après, ce qui reste, budget tokens réel constaté
- [ ] `pnpm typecheck` + `bash scripts/verify-all.sh` verts
- [ ] Commit `docs(mission): vague 2 publiée`
