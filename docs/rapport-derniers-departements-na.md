# Chantier — derniers départements de Nouvelle-Aquitaine

## Objectif et résultat mesuré

Les tranches précédentes ont livré le crawler de sitemaps (46 flux, PR #320) et
les 20 sources techniques avec 74 revendications rattachées (PR #332). Le dernier
trou de couverture publié dans le dépôt restait les départements sans événement.
Cette tranche le ferme.

| Compteur | Avant | Après |
| --- | ---: | ---: |
| Départements NA avec au moins un événement | 10 / 12 | **12 / 12** |
| Départements NA à zéro | 2 (`19`, `23`) | **0** |
| Événements rattachés à une org NA | 237 | **240** |
| Revendications NA vérifiées en attente de promotion | 3 | **0** |

Mesure reproductible :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-na-departments.mts \
  --json=bench/results/na-departments-2026-11-22.json
```

Sortie observée :
`Departments with an event: 12/12; at zero: 0 []; events: 240; gap claims pending: 0`.
L'état de départ est conservé dans `bench/results/na-departments-before-2026-11-22.json`
(`at zero: 2 [19,23]`). Chaque artefact porte les trois requêtes SQL qui ont
produit les compteurs.
Contrôle du 2026-11-22 sur la base de travail courante (jeu de données
reconstruit entre les deux mesures) : `12/12; at zero: 0 []; events: 45;
gap claims pending: 0`, soit la même couverture départementale et toujours
zéro revendication en attente.

## Méthode

1. **Revendications retenues** : une revendication NA vérifiée, rattachée
   à une organisation du référentiel dont le département est l'un des
   douze départements NA, et dont le département est un trou (`19` Corrèze,
   `23` Creuse), avec une URL de preuve publique en HTTPS. Trois lignes
   (identifiants 13517, 19923, 33732) répondaient à ce critère.
2. **Validation stricte** : `apps/api/src/technical/na-departments.ts` refuse un
   département hors des deux trous, une URL HTTP ou avec identifiants, et tout
   champ de niveau victime (`victim`, `description`, …). Aucun corps de fuite
   n'est lu.
3. **Événement public** : `assertion_type = third_party_claim`, `confidence = C3`,
   `regional = true`, titre générique sans nom d'organisation ni de victime,
   `summary = null`. La preuve ne contient que l'identifiant de la revendication,
   l'identifiant de l'organisation, le département, le groupe, la date et l'URL
   publique. L'événement porte `admission_rule = na_gap_claim`, ce qui le rend
   auditable ; la date d'observation est la date de promotion, la date de la
   revendication restant dans la preuve.
4. **Idempotence** : `dedup_key = na-gap:<identifiant de revendication>` et
   `ON CONFLICT DO NOTHING`. La demande de promotion relancée après la première
   passe ne retrouve aucune revendication à traiter (`scanned: 0`).
5. **Surface API** : `GET /api/coverage/na-departments` renvoie les douze
   compteurs et la liste des départements à zéro ; la route est enregistrée dans
   `routes/index.ts` et déclarée publique dans `security/rbac.ts`. Le diff de
   `apps/api/src/server.ts` est de **0 ligne** par rapport à la base de la
   branche (limite : 10).

Commande d'application et résultat observé :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/fill-na-department-gaps.mts \
  --json=bench/results/na-departments-gaps-applied-2026-11-22.json
```

Première passe du 2026-11-21 : `inserted=3, refused=0`. L'artefact
`na-departments-gaps-applied-2026-11-22.json` ci-dessus est celui de la
relance (`scanned: 0`) ; la trace des trois événements créés est dans les
artefacts avant/après (`19` : 0 → 1, `23` : 0 → 2, total 237 → 240).

## Vérifications

- `DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx apps/api/test/run.ts \
  apps/api/test/na-departments.test.ts apps/api/test/technical-coverage.test.ts \
  apps/api/test/contrat-routes.test.ts apps/api/test/securite-rbac.test.ts \
  apps/api/test/securite-couverture.test.ts` : **50 tests réussis, 0 échec**,
  dont 6 tests pour cette tranche (un comportement par test : refus hors trou,
  refus HTTP, refus de champ personnel, événement sans corps de fuite,
  idempotence, route agrégée).
- `tsc --noEmit -p apps/api/tsconfig.json` : réussi.
- Rejouabilité : la mesure et la promotion ne font aucun appel réseau ; chaque
  commande est terminée en moins de 15 s.
- La branche a été réalignée sur `origin/ext/chantier-b3` (25 commits reçus,
  dont la version rebasée de la tranche précédente) avant ce commit : aucun
  retour à `origin/main`.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : les douze départements autorisés et, pour
  cette tranche, les deux seuls trous (`19`, `23`).
- **Sources grises autorisées** : plaques de revendication et agrégateurs
  publics conservés comme URL de preuve, sans contenu de fuite.
- **Aucune donnée personnelle** : identifiants et départements seulement ; ni
  nom de victime, ni e-mail, ni téléphone, ni description de fuite.
- **Aucun service payant** : aucune requête réseau, lecture seule de la base
  locale puis écriture d'événements dérivés de preuves déjà vérifiées.
- **Code et interface en anglais**, rapport en français.

## Prévolution et limites

- Les trois événements créés restent des **affirmations de tiers** (`C3`), pas
  des incidents confirmés ; leur groupe, leur date et leur URL de preuve sont
  conservés dans `evidence`.
- Le `source_id` est résolu depuis une source ransomware déjà inscrite dans le
  référentiel : c'est une clé d'audit de la collecte, pas une affirmation que la
  source d'origine a fourni un incident confirmé.
- Les cinq familles de sources, les douze départements et les 74 revendications
  des tranches précédentes restent mesurables séparément ; cette tranche ne les
  remplace pas.

## CHANTIER TERMINÉ

Les douze départements de Nouvelle-Aquitaine ont désormais au moins un
événement, les 46 flux de sitemaps et les 20 sources techniques sont intégrés,
et les revendications vérifiées en attente de couverture sont à zéro : l'objectif
de couverture totale sans trou du chantier est atteint et mesuré.

OBJECTIF : atteint — 12 / 12 départements
