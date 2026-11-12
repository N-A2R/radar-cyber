# Socle — remonter l'environnement de zéro

Ce document existe parce que la procédure n'existait nulle part. Quand le
sandbox a été réinitialisé en cours de chantier, remonter la démo a demandé une
dizaine d'étapes retrouvées de mémoire, et deux d'entre elles étaient cassées
sans que personne ne le sache. Un socle qu'on ne peut pas rejouer n'est pas un
socle.

**Tout est hors réseau.** Le jeu NA (4 462 organisations) et l'échantillon de
revendications (500) sont versionnés dans le dépôt. Pas de Python, pas d'API
gouv, pas de dump à télécharger.

## Une commande

```bash
pnpm install --frozen-lockfile

# Terminal 1 — PostgreSQL embarqué (aucun Docker, aucun psql système)
pnpm db:up

# Terminal 2 — schéma, migrations, sources, règles, référentiel, fixtures, compte
RADAR_ADMIN_PASSWORD='choisissez-un-mot-de-passe' pnpm setup

# Puis l'application
pnpm dev:api     # terminal 2
pnpm dev:web     # terminal 3
```

Mesuré sur le sandbox : **8/8 étapes en 4,3 s** depuis une base vide, dont
4 462 organisations et 22 904 alias. Un rejeu ne duplique rien (`+0` source).

Pour diagnostiquer sans rien écrire :

```bash
pnpm setup:check   # code de sortie 1 s'il manque une étape
```

## Ce que fait `scripts/bootstrap.mts`

| Étape | Source | Garde-fou |
|---|---|---|
| Connexion | `DATABASE_URL` | Message explicite si PG est éteint, avec la commande pour le démarrer |
| Schéma | `db/init.sql` | Saute si la table `event` existe |
| Migrations | `scripts/migrate.mts` | Compare `schema_migrations` au nombre de fichiers |
| Sources | 16 catalogues `db/sources*.sql` | `INSERT … ON CONFLICT` : rejeu = `+0` |
| Règles | `db/detection-rules.sql` | Idempotent |
| Référentiel NA | `db/data/referentiel-na.json` | Saute au-delà de 4 000 orgs |
| Échantillon | `bench/fixtures/claims-sample.json` | `--with-sample` seulement ; refuse de mélanger à une vraie quarantaine |
| Compte | `scripts/create-admin.mts` | Exige `RADAR_ADMIN_PASSWORD`, sinon le signale sans échouer |

Le script **ne démarre pas PostgreSQL** et ne crée jamais de cluster implicite :
un socle ne devine pas où vivent les données. Il dit quoi lancer.

Variables : `DATABASE_URL` (défaut
`postgres://radar:radar@localhost:5432/radar`), `RADAR_ADMIN_PASSWORD`,
`RADAR_ADMIN_EMAIL` (défaut `admin@radar.local`). Pour le cluster embarqué :
`PGDATA` et `PGPORT`.

## Trois pannes trouvées en écrivant ce socle

Elles étaient invisibles parce que rien ne rejouait l'installation complète.

**1. `db/dev-pg.ts` ne démarrait pas.** Il utilise du top-level await, mais le
`package.json` racine n'a pas `"type": "module"` : `tsx` compilait en CJS et
esbuild refusait. Renommé en `db/dev-pg.mts`, comme les autres scripts. Le
fichier n'était référencé nulle part, donc personne n'avait eu à le lancer.

**2. Les scripts racine ne trouvaient pas `pg`.** pnpm cloisonne les
dépendances : `pg` est installé dans `apps/api`, pas à la racine.
`migrate.mts`, `create-admin.mts` et `quarantine-review.mts` échouaient en
`ERR_MODULE_NOT_FOUND`. Corrigés avec le `createRequire` ciblé qu'utilisaient
déjà `import-entreprises-na.mts` et `set-password.mts`.

**3. L'amorçage des migrations mentait sur une base neuve.** Le runner marquait
17 migrations « déjà appliquées » dès que la table de suivi était absente ou
vide, puis échouait sur `relation "org_alias" does not exist` — la table que
`migrate-014a` aurait dû créer. L'amorçage est désormais **conditionnel** : il
exige la trace des objets d'une base historique (`org_alias` **et**
`quarantine_raw`). Base neuve ⇒ les 23 migrations sont jouées dans l'ordre.

Effet de bord corrigé au passage : le lot entier était dans une seule
transaction, mais `migrate-021` et `022` portent leur propre `BEGIN;`/`COMMIT;`
(écrits pour `psql`). Leur `COMMIT` validait le travail déjà fait : un échec plus
loin laissait une base à moitié migrée et une table de suivi fausse. Le runner
ouvre maintenant une transaction **par migration**, et laisse celles qui en
fournissent une piloter la leur — sans réécrire leur SQL, ce qui casserait les
blocs PL/pgSQL (un `END;` y ferme un bloc, pas une transaction).

## Vérifier

```bash
pnpm verify    # contrat hors base, socle, tsc api + web, tests API, tests front, build, healthcheck
```

Une CI complète est prête dans `scripts/ci/ci.proposed.yml`, avec un job qui
rejoue `pnpm setup` depuis une base vide puis une seconde fois pour
l'idempotence. **Elle n'est pas appliquée** : le jeton de cette session n'a pas
la permission GitHub `workflows`. Un mainteneur peut la copier — voir
[scripts/ci/README.md](../scripts/ci/README.md). C'est ce job qui aurait attrapé
le bug d'amorçage : la CI en place applique le SQL via `psql` et contourne le
runner de migrations.

Les tests créent leur propre base jetable `radar_test_<pid>_<horodatage>` et la
détruisent à la fin. Ils n'utilisent jamais la base applicative.

## Contrat d'événement

Voir [contrat.md](contrat.md) : `EventSchema` est désormais appliqué aux cinq
chemins d'écriture, et `FAMILIES` compte 13 valeurs.
