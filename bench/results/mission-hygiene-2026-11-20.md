# Mission hygiène des mesures — rapport de fin

Date : 2026-11-20 · Branche : `mission/4h-glm` · Plan : `docs/plans/mission-hygiene.md`

Objectif : rendre **reproductible et honnête** ce qui est déjà publié dans
`bench/results/` et `docs/` — aucune collecte ajoutée, aucune nouvelle source.
Règle tenue de bout en bout : un chiffre sans requête rejouable sort du texte,
sa requête entre. La collecte étant restée active toute la soirée, les compteurs
vivants (événements ingérés, rejets, faits vulnérabilité) ont été traités comme
des compteurs vivants, pas figés.

## Task 1 — Les deux SQL Telegram ne se contredisent plus

*Commit : `fix(db): les SQL telegram ne se contredisent plus`*

- Constat : `db/sources-telegram-triage.sql` désactivait les 5 canaux
  ransomware (« câblage à arbitrer ») ; `db/sources-telegram-narrative.sql`,
  committé 47 min plus tard le même jour (16:35 → 17:22), les passait en
  `kind='narrative', enabled=true`. L'état final dépendait de l'ordre d'exécution.
- Tranché : l'arbitrage utilisateur est le fichier `narrative` (postérieur).
  La section 3 du triage ne contient plus d'UPDATE sur ces IDs — elle renvoie
  au fichier d'arbitrage. `docs/sources-triage.md` dit l'arbitrage intervenu
  au lieu de « décision laissée à l'utilisateur ».
- Preuve : rejeu des deux fichiers dans les **deux ordres** sur la base
  (`localhost:5433/radar`) → état final identique : les 5 canaux
  (`tg-baseleeak`, `tg-leaked-databases`, `tg-marketo-leaks`, `tg-ransomwareg`,
  `tg-snatch-news`) narratifs et actifs, `tg-intelowl` seul désactivé
  (handle réutilisé).

## Task 2 — La preuve SIRENE de DEMOS dit ce qu'elle montre

*Commit : `fix(mesure): la preuve SIRENE de DEMOS dit ce qu'elle montre`*

- Constat : dans `bench/results/manques-glm-2026-11-20.json`, l'entrée
  `demos.fr` citait `search?q=722030277` mais son extrait listait 12 entités
  DEMOS sans le SIREN 722030277 — c'était la réponse d'une autre requête
  (`q=demos`), donc « confirmé au registre » n'était pas prouvé par l'extrait.
- Preuve : rejeu de la requête citée le 2026-11-20 → **résultat unique** :
  `722030277 DEMOS (DEMOS TRAINING)` (actif, PUTEAUX), siège
  7 COURS VALMY 92800 PUTEAUX, SIRET siège 72203027700320, nature juridique
  5599 — recoupe tous les champs de l'entrée. L'extrait est remplacé par cette
  réponse réelle ; la mention « confirmé au registre » est gardée, maintenant
  prouvée.

## Task 3 — `couvreFenetre` est calculé, plus affirmé

*Commit : `fix(mesure): couvreFenetre est calculé, plus affirmé`*

- Constat : `rupture-rejeu-2026-11-20.json` portait `couvreFenetre: true` avec
  `maxDatePublique: 2026-11-10` pour une fenêtre finissant le 2026-11-20 — la
  formule du script ajoutait la tolérance de veille (35 j) à la comparaison,
  donc affirmait une couverture que le corpus n'a pas.
- Fix : `scripts/mesure-fausses-alertes.mts` lit désormais la couverture telle
  quelle (`fenetre.fin <= maxDateCorpus`) ; la tolérance reste l'affaire du
  classement des alertes (`estClassable`), pas de cette affirmation.
- Preuve : JSON régénéré par le script (commande dans le champ `commande` du
  fichier) → `couvreFenetre: false`. Les autres champs recalculés suivent la
  base du jour (candidats 19 → 23, faits vuln 23 472 → 23 478) ; conclusions
  inchangées : 3 raisons structurelles confirmées, 0 alerte émise.

## Task 4 — Chaque chiffre publié cite sa requête

*Commit : `docs(mesure): chaque chiffre publié cite sa requête`*

- **`5 200 événements`** (mission-glm, l.22) : compteur vivant — la collecte a
  repris pendant la rédaction et le total a continué de grimper. Nombre retiré,
  requête citée : `SELECT count(*) FROM event WHERE collected_at >= '2026-11-20 17:49'`.
- **`53 627 rejets dont 37 941 leak:ransomwatch`** (même fichier, l.102-103) :
  même cause, valeurs dérivées (le motif `presse` de `leak:ransomwatch:posts`
  valait 62 756 au soir). Nombre retirés, ventilation exacte citée :
  `SELECT r.source_id, sum((r.items_rejected->>'presse')::bigint) FROM collector_run r WHERE r.finished_at >= '2026-11-14' AND r.items_rejected ? 'presse' GROUP BY r.source_id ORDER BY 2 DESC`.
  Au passage, le claim « 0 événement admis de cette source depuis toujours »
  était faux au soir (382 événements famille `leaks` admis le 20 nov) —
  corrigé, requête citée.
- **`312 / 698 sources`** (`db/sources-ransomware-triage.sql:6`) : portait sur
  des événements **purgés** depuis le 17 nov par `scripts/purge-non-claims.mts`
  (la « décision séparée » annoncée par le SQL ; 0 événement restant sur ces
  deux sources, vérifiable par `SELECT count(*) FROM event WHERE source_id IN ('ransom-emsisoft-decrypt','ransom-nomoreransom')`)
  — comptage non rejouable sur la base courante. Nombres retirés du commentaire
  et du `disabled_reason` ; base resynchronisée par rejeu du fichier SQL.
  L'observation datée reste qualitative (« majorité des événements de la
  famille »).
- **`23 472 faits`** (`rupture-rejeu-2026-11-20.json`) : le script porte
  désormais un champ `commande` dans chaque JSON publié (rejeu exact) ; JSON
  régénéré, `mission-glm-2026-11-20.md` aligné sur les valeurs courantes avec
  le champ source nommé (`candidats30j`, `faitsVuln`).

Critère : aucun des quatre ne reste sans requête vérifiable.

## Task 5 — Les plans et rapports disent la même chose

*Commit : `docs: les plans et rapports disent la même chose`*

- `mission-glm-2026-11-20.md` disait « 6 tâches » (l.5) et « Récapitulatif des
  5 tâches » (l.9) : le plan `mission-4h.md` compte 6 tâches, la sixième est
  le rapport lui-même — l'intitulé du récapitulatif le dit maintenant.
- `mission-vague2.md` annonçait 19 lots, 5 listés : état réel consigné en tête
  de Task 1 — **3 lots faits** (A, B, C : 30 entités, 12 résolues, d'après
  `manques-glm-vague2.json` et les commits de 23:28-23:34), **16 restants**
  (D à S, 159 entités) ; la liste couvre désormais les 19 lots jusqu'au lot S
  (9 entités, cohorte 199).
- `mission-4h.md` disait « plan exécuté par ralphex » quand `mission-cs.md`
  consigne la migration vers claude-squad le 20 nov : l'en-tête du plan 4h dit
  l'état réel — ralphex pour les tâches 1-4 (avant la migration de 19:14),
  `cs` pour les tâches 5-6 (21:45, 21:50).

## Validation

- `pnpm typecheck` : vert (API et web).
- `bash scripts/verify-all.sh` (avec
  `RADAR_TEST_ADMIN_URL='postgres://radar:radar@localhost:5433/postgres'`) :
  **vert** — « Vérification complète OK » (contrat, socle, typechecks, tests
  API, tests web, build, healthcheck). Healthcheck du passage : 286 sources,
  26 995 événements, 1 244 048 organisations (`/api/stats`).

## Ce qui reste ouvert

1. **Les compteurs vivants** (ingérés depuis 17:49, ventilation des rejets,
   faits vuln) dérivent tant que la collecte tourne : leurs requêtes sont
   citées, leurs valeurs ne sont plus figées — republier au moment voulu
   plutôt que de figer un instantané.
2. **Le compteur « presse » reste trompeur** : le motif `presse` n'est pas un
   volume de presse. Le chantier de design presse_cyber de la vague GLM reste
   ouvert (famille `presse_*` stérile, 15 sources).
3. **Vague 2 : 16 lots restants** (D à S, 159 entités de la cohorte france) ;
   le lot suivant est D (entités 41-50).
4. **Les agents de rupture émettent toujours 0 alerte** pour des raisons
   structurelles confirmées sur données — chantier `docs/fausses-alertes.md`
   (seuils ou fenêtres), hors périmètre de cette mission de correction.
