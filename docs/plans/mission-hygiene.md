# Plan : Mission hygiène des mesures — radar-cyber

> Suite de `mission-4h.md` et `mission-vague2.md`. Objectif court et vérifiable :
> rendre **reproductible et honnête** ce qui est déjà publié dans `bench/results/`
> et `docs/`. Aucune nouvelle collecte, aucun nouvel import : on corrige, on ne
> collecte pas.
>
> Règle absolue : ne jamais inventer un chiffre. Un nombre publié vient soit
> d'une requête citée dans le fichier, soit il disparaît.

## Validation Commands

- `pnpm typecheck`
- `bash scripts/verify-all.sh`
- `DATABASE_URL=postgres://radar:radar@localhost:5433/radar`

## Task 1: Départager les deux SQL Telegram

`db/sources-telegram-narrative.sql` passe 5 canaux en `kind='narrative', enabled=true`.
`db/sources-telegram-triage.sql` passe **les mêmes IDs** en `enabled=false`.
L'état final dépend donc de l'ordre d'exécution.

- [x] Lire les deux fichiers et `docs/sources-triage.md` pour établir l'état voulu
- [x] Réécrire le fichier perdant pour qu'il ne touche plus ces IDs (ou fusionner
      les deux intentions en un seul fichier dont l'en-tête dit l'ordre)
- [x] Vérifier en base l'état effectif des 5 canaux après rejeu des deux fichiers
- [ ] Commit : `fix(db): les SQL telegram ne se contredisent plus`

Critère de sortie : rejouer les deux fichiers dans les deux ordres donne le même état.

## Task 2: Corriger la preuve SIRENE de DEMOS

`bench/results/manques-glm-2026-11-20.json`, entrée `demos.fr` : la raison dit
« et confirmé au registre », mais l'extrait `registre-sirene`
(`search?q=722030277`) ne contient pas `722030277`.

- [x] Rejouer la requête `https://recherche-entreprises.api.gouv.fr/search?q=722030277`
      et vérifier si le SIREN apparaît
- [x] Si oui : remplacer l'extrait par la réponse réelle et garder la mention
- [ ] Si non : reformuler en « SIREN publié par le site », sans prétendre au registre
- [ ] Commit : `fix(mesure): la preuve SIRENE de DEMOS dit ce qu'elle montre`

## Task 3: `couvreFenetre` doit être calculé

`bench/results/rupture-rejeu-2026-11-20.json` porte `couvreFenetre: true` alors que
`maxDatePublique` vaut `2026-11-10` pour une fenêtre finissant le `2026-11-20`.

- [ ] Trouver le script qui produit ce fichier (`scripts/mesure-fausses-alertes.mts`
      ou `scripts/mesure-rattachement.mts`)
- [ ] Calculer `couvreFenetre` à partir de `maxDatePublique` et de la fin de fenêtre,
      au lieu de l'écrire en dur
- [ ] Régénérer le JSON et vérifier que le champ vaut `false`
- [ ] Commit : `fix(mesure): couvreFenetre est calculé, plus affirmé`

## Task 4: Chiffres sans requête

Quatre nombres sont publiés sans qu'on puisse les reproduire. Pour chacun : soit la
requête exacte est ajoutée au fichier, soit le nombre est retiré.

- [ ] `5 200 événements` — `bench/results/mission-glm-2026-11-20.md:22`
- [ ] `53 627 rejets dont 37 941 leak:ransomwatch` — même fichier, `l.102-103`
- [ ] `312 / 698 sources` — `db/sources-ransomware-triage.sql:6`
- [ ] `23 472 faits` — `bench/results/rupture-rejeu-2026-11-20.json:48`
- [ ] Commit : `docs(mesure): chaque chiffre publié cite sa requête`

Critère de sortie : aucun des quatre ne reste sans requête vérifiable.

## Task 5: Cohérence des documents

- [ ] `bench/results/mission-glm-2026-11-20.md:5` dit « 6 tâches », `l.9` dit
      « 5 tâches » : trancher et aligner
- [ ] `docs/plans/mission-vague2.md` annonce 19 lots, 5 listés : dire combien sont
      faits (A, B, C), combien restent, et mettre à jour la liste
- [ ] `docs/mission-cs.md` et `docs/plans/mission-4h.md` se contredisent sur
      l'outil d'exécution (cs vs ralphex) : aligner sur l'état réel
- [ ] Commit : `docs: les plans et rapports disent la même chose`

## Task 6: Rapport de la vague

- [ ] Écrire `bench/results/mission-hygiene-2026-11-20.md` : les 5 corrections,
      la preuve de chacune, et ce qui reste ouvert
- [ ] `pnpm typecheck` + `bash scripts/verify-all.sh`, corriger si rouge
- [ ] Commit : `docs(mission): rapport hygiène publié`
