# Rapport — Points de défaillance numériques en Nouvelle-Aquitaine

OBJECTIF : atteint — 4 prestataires publiés (OVHcloud 544, Microsoft 365 273, Gandi 108, Google Workspace 102 organisations NA) / 4 prestataires dépassant 100 organisations NA mesurés dans l'état réel.

## Ce qui est livré

La liste des hébergeurs et prestataires dont la panne toucherait **plus de 100 organisations de Nouvelle-Aquitaine**, exposée en JSON via `GET /api/na/provider-spof` et produite par la commande de mesure reproductible ci-dessous. Le seuil est strict : une organisation exactement à 100 n'est pas retenue (Hornetsecurity, 96 organisations, sert de contrôle de non-franchissement).

| Prestataire | Services observés | Organisations NA touchées | Domaines concernés |
|---|---|---:|---:|
| OVHcloud | DNS + messagerie | 544 | 528 |
| Microsoft 365 | messagerie | 273 | 256 |
| Gandi | DNS + messagerie | 108 | 98 |
| Google Workspace | messagerie | 102 | 96 |

Une organisation est comptée **une seule fois par prestataire**, quel que soit le nombre de domaines, de serveurs NS ou de serveurs MX qui pointent vers lui. Une organisation dépendant de deux prestataires distincts est comptée dans chacun.

## État réel de départ

| Fait | Valeur observée | Origine |
|---|---:|---|
| Organisations annoncées par la mission | 1 673 151 | consigne de chantier |
| Organisations (comptage exact) | 1 673 220 | `SELECT count(*) FROM org` |
| Organisations (estimation planificateur, utilisée dans le JSON) | 1 672 551 | `pg_class.reltuples` |
| Sources | 463 | `SELECT count(*) FROM source` |
| Événements | 27 899 | `SELECT count(*) FROM event` |
| Organisations NA avec domaine suivi | 1 285 | jointure `provider_domain` → `org` sur les 12 départements NA |
| Domaines avec observation NS/MX exploitable | 1 222 | `SELECT count(*) FROM provider_domain WHERE last_state <> 'erreur'` |
| Suffixes de prestataires publics catalogués | 127 | `SELECT count(*) FROM dns_fournisseur` |

## Méthode

1. Observations DNS publiques (DoH gratuit, sans clé ni service payant) : derniers enregistrements NS et MX par domaine, stockés dans `provider_domain`. Les sources grises sont autorisées ; aucune donnée personnelle de victime n'est lue.
2. Filtre Nouvelle-Aquitaine sur `org.dept` dans les 12 départements (16, 17, 19, 23, 24, 33, 40, 47, 64, 65, 79, 86, 87), appliqué dans la requête avant tout agrégat.
3. Attribution de chaque hôte NS (catégories `dns`, `hosting`, `cdn`, `cloud`) et MX (catégories `mail`, `cloud`) au suffixe public le plus précis du catalogue, via les fonctions déjà versionnées `providerFor` / `providerMatches`.
4. Comptage d'organisations distinctes par prestataire, déduplication NS/MX, tri déterministe par nombre décroissant puis nom, et filtre strict `> 100`.
5. Vérification croisée du chiffre par une requête SQL indépendante de l'agrégateur TypeScript : mêmes quatre prestataires et mêmes effectifs.

Les 786 hôtes NS/MX non reconnus par le catalogue restent comptés comme « inconnus » et ne sont **pas** attribués : le résultat ne surestime pas la couverture. Les 125 organisations sans correspondance de suffixe public ne sont pas comptées comme dépendantes d'un prestataire.

## Commande reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm measure:provider-spof
```

Sortie observée :

```
NA providers above 100 organizations: 4 (OVHcloud=544, Microsoft 365=273, Gandi=108, Google Workspace=102) -> bench/results/provider-spof.json
```

Le JSON publié contient la liste, les agrégats, les requêtes SQL exactes et l'horodatage. Aucun nom d'organisation, aucun domaine isolé et aucun identifiant d'organisation n'y figure.

## Tests — un comportement par test

```bash
cd apps/api
RADAR_TEST_ADMIN_URL=postgres://radar:radar@localhost:5433/postgres \
  ./node_modules/.bin/tsx test/run.ts \
  test/provider-spof.test.ts test/provider-spof-api.test.ts test/securite-couverture.test.ts
```

Résultat observé : **14 tests, 14 réussis, 0 échec, 32,9 s**. `tsc --noEmit` vert (3,4 s). Comportements couverts : comptage d'organisations et non de domaines, seuil strict, filtre régional, déduplication NS/MX, catégories NS/MX, classement déterministe, anonymat, accès public de la route, validation du seuil, couverture de la matrice d'accès.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : filtre SQL sur `org.dept` et tests dédiés (une organisation hors région est exclue du décompte).
- **Sources grises autorisées** : DNS-over-HTTPS public et catalogue de suffixes publics ; aucune donnée personnelle de victime n'est chargée ni exposée.
- **Aucun service payant** : aucune clé API, aucun abonnement.
- **Code et interface en anglais** : modules, clés JSON, messages et commentaires techniques en anglais ; seul ce rapport est en français.
- **`server.ts` inchangé** : 0 ligne de diff (route enregistrée dans le registre unique `routes/index.ts`).
- **Commandes < 60 s** : mesure en quelques secondes, tests ciblés en 32,9 s, typecheck en 3,4 s.

## Limites

Le résultat porte sur les 1 285 organisations du référentiel qui disposent d'un domaine suivi, et non sur la totalité des 1,67 million d'organisations : une organisation sans domaine observable ne peut pas être rattachée à un prestataire. La dépendance mesurée est une dépendance de service constatée sur des enregistrements publics, pas une preuve de panne réelle ni de contrat exclusif. Les suffixe non catalogués sont explicitement comptés comme inconnus plutôt que devinés.
