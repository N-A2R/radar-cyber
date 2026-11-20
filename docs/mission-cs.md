# Mission — exécution avec claude-squad (`cs`)

> Remplace ralphex comme moteur d'exécution depuis le 20 novembre 2026.
> Décision : on veut **voir la vraie TUI Claude Code** pendant que l'agent
> travaille, pouvoir intervenir, et garder l'isolation par worktree.

## Pourquoi ce changement

| | ralphex | claude-squad (`cs`) |
|---|---|---|
| Visibilité | dashboard web + tail de transcript | **vraie TUI Claude**, `↵` pour s'attacher |
| Session | `claude -p` (non attachable) | session tmux interactive, attachable |
| Isolation | même worktree, une branche | **un worktree git par instance** |
| Reprise | plan à cases cochées | instance vivante, `c` pour committer/merger |
| Contexte | neuf à chaque tâche | vivant (on gère à la main) |

## Lancement

```bash
cd ~/radar-cyber
cs                      # profil par défaut = « glm (pont zcode) »
```

Dans la TUI :

- `N` — nouvelle instance **avec** prompt (coller une tâche ci-dessous)
- `n` — nouvelle instance vide
- `↵` / `o` — **s'attacher** : vraie TUI Claude, on voit tout, on intervient
- `ctrl-q` — se détacher, l'agent continue en fond
- `tab` — preview live / diff des changements
- `c` — committer la branche de l'instance et mettre en pause
- `p` — pousser la branche et ouvrir une PR
- `D` — tuer l'instance (supprime son worktree)

Chaque instance travaille dans `~/.claude-squad/worktrees/jolt/<nom>` sur la
branche `jolt/<nom>`, créée depuis la branche courante du dépôt principal.

## Règle de fusion

Une instance = un worktree = une branche. Quand une tâche est finie :

1. `c` dans `cs` → la branche de l'instance est commitée
2. dans le dépôt principal : `git merge jolt/<nom>` (ou `p` pour une PR)
3. `D` pour supprimer l'instance et son worktree

Ne jamais lancer deux instances qui écrivent le **même fichier** — l'isolation
git protège des conflits au merge, pas du travail redondant.

## Budget

Le pont zcode plafonne à **3 streams simultanés** (mesuré). Donc : au maximum
**2 instances en parallèle** pour garder de la marge.

Le JWT du pont meurt **toutes les ~2 h** : quand `cs` affiche des erreurs 401,
relancer `~/tmp/zcode-bridge login`, approuver l'URL, **redémarrer le pont**,
puis `r` (resume) sur les instances.

## État au 20 novembre — 19 h 15

| Tâche | État | Commit |
|---|---|---|
| 1 — incident collecte 17-20 nov | ✅ fait | `a23f5a0` |
| 2 — refresh EPSS réel | ✅ fait | `060f48b` |
| 3 — rejeu agents de rupture | ✅ fait | `30d7c25` |
| 4 — 10 entités manquantes (8/10 résolues) | ✅ fait | `6754f34` |
| 5 — précision presse_cyber | ⏳ à faire | — |
| 6 — rapport de mission | ⏳ à faire | — |

## Prompts prêts à coller

### Tâche 5 — précision du fil presse_cyber

```
Lis docs/plans/mission-4h.md section « Task 5 ». Exécute-la intégralement :
compte les événements presse_cyber admis depuis le 14 nov, vérifie un
échantillon de 20 à la main, publie bench/results/presse-cyber-precision-<date>.json
avec le taux et les motifs de non-cyber, puis committe avec
« mesure(presse): précision du fil presse_cyber publiée ». Ne modifie pas le
classificateur : cette tâche est une mesure. Dis <promise>FAIT</promise> quand
le commit est passé.
```

### Tâche 6 — rapport de mission

```
Lis docs/plans/mission-4h.md section « Task 6 ». Écris
bench/results/mission-glm-<date>.md : récapitulatif des tâches 1 à 5 avec les
chiffres avant/après et ce qui reste. Lance pnpm typecheck et
bash scripts/verify-all.sh, et ne committe que si les deux passent, avec
« docs(mission): rapport 4h GLM publié ». Dis <promise>FAIT</promise> à la fin.
```
