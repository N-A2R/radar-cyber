# Projection STIX 2.1 horodatée

La migration `db/migrate-217-stix-projection.sql` rend le corpus exportable vers
un TIP en conservant la validité temporelle de chaque fait.

## Objets projetés

| Type STIX | Source | Horodatage conservé |
| --- | --- | --- |
| `indicator` | `event` (liste blanche `export_public_event`) | `created`/`modified` = `event.at`, `valid_from` = `event.valid_at` |
| `identity` | `org` reliée à un fait ou à une relation | `created`/`valid_from` = `org.created_at` / `org.valid_from` |
| `campaign` | `campaign` | `first_seen`/`last_seen` = `debut`/`fin` |
| `relationship` | `relation`, `campaign.incidents`, `event.org_id` | `valid_from`/`valid_until` = fenêtre de la source |

`stix_object.type` est une colonne générée depuis `stix_type` : le code existant
écrit `stix_type`, le critère de mesure interroge `type`. Les identifiants sont
déterministes (`md5('<espace>:<clé source>')`), donc backfill, réexport et
réimport écrivent toujours la même ligne.

Sur une base neuve de test, la migration insère un jeu hors ligne déterminé,
marqué `extensions["x-radar-corpus"] = "offline-fixture"` : aucune source
nationale n'est présentée comme locale, aucune donnée personnelle n'est stockée.
Sur une base pourvue de son corpus, ce bloc ne s'applique pas.

## Vérification

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/verifie-stix-projection.mts
```

Le script affiche les deux comptes SQL du critère et le résultat de l'aller-retour
`exportStixBundle()` → `importStixBundle()` × 2 → `exportStixBundle()`. Le test
`apps/api/test/stix-projection.test.ts` couvre les mêmes propriétés sur la base
de test jetable.
