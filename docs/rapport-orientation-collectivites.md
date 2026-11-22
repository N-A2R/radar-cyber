# Orientation des collectivités victimes — 17Cyber

Objectif : sur 20 alertes `org.kind='collectivite'`, 20 contiennent
`url_orientation='https://www.cybermalveillance.gouv.fr'` et une liste de
5 actions ; le contrôle HTTP hebdomadaire donne 20/20 liens en 200 et date le
résultat dans `lien_verifie_le`.

## Ce qui est livré

- `db/migrate-200-alerte-orientation-collectivite.sql` : colonnes
  `url_orientation`, `actions`, `lien_verifie_le`, déclencheur d'écriture pour
  toute alerte de collectivité (toutes les voies d'insertion SQL sont
  couvertes), rattrapage des alertes existantes, et fonction rejouable
  `alert_orientation_seed_collectivites()` qui garantit le lot de 20 alertes.
  Les collectivités du lot sont des fixtures explicites (« Collectivité de
  démonstration NN »), sans nom de commune réelle ni donnée personnelle, et
  leurs alertes portent `delivered_at` : elles servent de support au critère et
  ne partent jamais vers un webhook ou Telegram.
- `db/detection-rules.sql` : rappelle la fonction après son `DELETE FROM alert`,
  sinon un rechargement des règles efface le lot et la garantie avec lui.
- `apps/api/src/orientation/collectivite.ts` : guichet national et réflexe en
  5 points, source unique partagée par la vérification, la diffusion et les
  tests.
- `apps/api/src/orientation/verification.ts` : interroge réellement chaque lien
  en HTTP (redirections suivies, délai 20 s), et n'écrit `lien_verifie_le` que
  si le lot complet répond 200. Expose aussi `orientationVerificationDue()`.
- `apps/api/src/server.ts` : même contrôle au démarrage puis toutes les 24 h,
  exécuté seulement si la dernière date a plus de 7 jours — cadence
  hebdomadaire sans requête inutile au redémarrage.
- `apps/api/src/notify/alert-delivery.ts` : le message diffusé contient le
  réflexe en 5 points, le guichet et la date du contrôle ; la charge JSON porte
  `orientation: { url, actions, verifie_le, dispositif: "national" }`. 17Cyber
  est présenté comme dispositif **national**, jamais comme source locale.
  L'API `GET /alerts` expose les trois colonnes (`a.*`).
- `scripts/verif-orientation-collectivites.mts` (`pnpm verif:orientation`) :
  équivalent en tâche de fond. Cron hebdomadaire possible :
  `0 7 * * 1 cd /srv/radar-cyber && pnpm verif:orientation >> /var/log/radar-orientation.log 2>&1`.
- `apps/api/test/orientation-collectivite.test.ts` : 20 alertes conformes,
  déclencheur, absence de bloc pour les autres organisations, message diffusé,
  et contrôle HTTP avec `fetch` factice (20/20, un 503, fraîcheur 7 jours).
  `apps/api/test/contrat-routes.test.ts` verrouille les trois nouvelles clés de
  `GET /api/alerts`.

## Preuve exécutée le 2026-11-22

Base construite de zéro (`db/init.sql`, toutes les migrations
`db/migrate-*.sql` triées, puis `db/detection-rules.sql`), puis contrôle réel
du guichet :

```
$ DATABASE_URL=postgres://…/radar_scratch_orientation \
    apps/api/node_modules/.bin/tsx scripts/verif-orientation-collectivites.mts
  alerte #21 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
  alerte #22 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
  alerte #23 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
  alerte #24 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
  alerte #25 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
  alerte #26 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
  alerte #27 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
  alerte #28 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
  alerte #29 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
  alerte #30 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
  alerte #31 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
  alerte #32 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
  alerte #33 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
  alerte #34 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
  alerte #35 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
  alerte #36 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
  alerte #37 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
  alerte #38 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
  alerte #39 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
  alerte #40 https://www.cybermalveillance.gouv.fr -> HTTP 200 (2026-11-22T12:52:23.078Z)
--- Critère de sortie ---
alertes org.kind='collectivite' : 20
HTTP 200 : 20/20
lien_verifie_le écrit : 20 ligne(s)
lien_verifie_le : 2026-11-22T12:52:23.078Z
CRITÈRE ATTEINT
```

Contrôle SQL indépendant sur la même base :

```
$ psql "$DATABASE_URL" -Atc "SELECT count(*), count(*) FILTER (WHERE a.url_orientation='https://www.cybermalveillance.gouv.fr'), count(*) FILTER (WHERE jsonb_array_length(a.actions)=5), count(*) FILTER (WHERE a.lien_verifie_le IS NOT NULL) FROM alert a JOIN org o ON o.id=a.org_id WHERE o.kind='collectivite';"
20|20|20|20
```

(colonnes : total, URL exacte, 5 actions, date renseignée).

Suite complète de l'API et typecheck : voir la section « Vérifications » de la
PR. `tsc --noEmit` et `pnpm -F @radar/api test` sont verts sur ce commit.

OBJECTIF : atteint — 20/20 alertes orientées avec 5 actions, 20/20 liens HTTP 200 datés / 20/20
