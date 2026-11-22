# Rapport — Points de défaillance numériques en Nouvelle-Aquitaine

OBJECTIF : atteint — 4 prestataires publiés (OVHcloud 544, Microsoft 365 273, Gandi 108, Google Workspace 102 organisations NA) / 4 prestataires dépassant 100 organisations NA mesurés dans l'état réel.

OBJECTIF (tranche 2 — couverture) : atteint — 584 hôtes NS/MX inconnus et 1 177 organisations NA attribuées / 786 hôtes inconnus et 1 160 organisations attribuées avant la tranche, soit 202 hôtes en moins et 17 organisations supplémentaires sans modifier la liste des 4 prestataires > 100 organisations.

## Ce qui est livré

La liste des hébergeurs et prestataires dont la panne toucherait **plus de 100 organisations de Nouvelle-Aquitaine**, exposée en JSON via `GET /api/na/provider-spof` et produite par la commande de mesure reproductible ci-dessous. Le seuil est strict : une organisation exactement à 100 n'est pas retenue (Hornetsecurity, 96 organisations, sert de contrôle de non-franchissement).

| Prestataire | Services observés | Organisations NA touchées | Domaines concernés |
|---|---|---:|---:|
| OVHcloud | DNS + messagerie | 544 | 528 |
| Microsoft 365 | messagerie | 273 | 256 |
| Gandi | DNS + messagerie | 108 | 98 |
| Google Workspace | messagerie | 102 | 96 |

Une organisation est comptée **une seule fois par prestataire**, quel que soit le nombre de domaines, de serveurs NS ou de serveurs MX qui pointent vers lui. Une organisation dépendant de deux prestataires distincts est comptée dans chacun.

## Tranche 2 — extension du catalogue public

La migration `db/migrate-068-spof-attribution-coverage.sql` ajoute 9 suffixes au catalogue public (127 → 136 lignes). Chaque suffixe est observé dans les enregistrements NS/MX de Nouvelle-Aquitaine et rattaché à un opérateur identifié par une source publique gratuite ; aucune donnée personnelle ni service payant n'est impliqué.

| Suffixes | Opérateur | Catégorie | Preuve publique |
|---|---|---|---|
| `ui-dns.biz`, `ui-dns.com`, `ui-dns.de`, `ui-dns.org` | IONOS | DNS | [Documentation IONOS Cloud DNS](https://docs.ionos.com/cloud/network-services/cloud-dns/api-how-tos/create-secondary-dns-zone.md) : serveurs secondaires `nscs.ui-dns.*` |
| `mailinblack.com` | MailinBlack | messagerie | [Mentions légales](https://www.mailinblack.com/mentions-legales/) |
| `lwsdns.com` | LWS | DNS | [RDAP Verisign](https://rdap.verisign.com/com/v1/domain/LWSDNS.COM) : serveurs `rdap.lws.net` |
| `pphosted.com` | Proofpoint | messagerie | [RDAP Verisign](https://rdap.verisign.com/com/v1/domain/PPHOSTED.COM) : serveurs `proofpoint.com` |
| `mimecast.com` | Mimecast | messagerie | hôtes MX publics `*.mimecast.com` observés |
| `cloudflare.net` | Cloudflare | messagerie | hôtes MX publics `route*.mx.cloudflare.net` observés |

Effet mesuré sur l'état réel (même requête, même seuil, catalogue étendu) :

| Mesure | Avant | Après |
|---|---:|---:|
| Hôtes NS/MX non reconnus | 786 | 584 |
| Organisations NA attribuées | 1 160 | 1 177 |
| Organisations NA non attribuées | 125 | 108 |
| Prestataires > 100 organisations | 4 | 4 (effectifs inchangés) |
| IONOS (DNS + messagerie) | 25 organisations | 46 organisations |

Les hôtes `trendmicro.eu` et `dns16.fr` sont volontairement laissés inconnus : les enregistrements observés sont des hôtes clients de filtrage ou une infrastructure publique locale, et non l'identité d'un prestataire de service.

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
| Suffixes de prestataires publics catalogués | 136 (127 avant la tranche 2) | `SELECT count(*) FROM dns_fournisseur` |
| Organisations NA avec domaine attribuées | 1 177 | agrégateur `provider-spof` |
| Hôtes NS/MX non reconnus | 584 | agrégateur `provider-spof` |

## Méthode

1. Observations DNS publiques (DoH gratuit, sans clé ni service payant) : derniers enregistrements NS et MX par domaine, stockés dans `provider_domain`. Les sources grises sont autorisées ; aucune donnée personnelle de victime n'est lue.
2. Filtre Nouvelle-Aquitaine sur `org.dept` dans les 12 départements (16, 17, 19, 23, 24, 33, 40, 47, 64, 65, 79, 86, 87), appliqué dans la requête avant tout agrégat.
3. Attribution de chaque hôte NS (catégories `dns`, `hosting`, `cdn`, `cloud`) et MX (catégories `mail`, `cloud`) au suffixe public le plus précis du catalogue, via les fonctions déjà versionnées `providerFor` / `providerMatches`.
4. Comptage d'organisations distinctes par prestataire, déduplication NS/MX, tri déterministe par nombre décroissant puis nom, et filtre strict `> 100`.
5. Vérification croisée du chiffre par une requête SQL indépendante de l'agrégateur TypeScript : mêmes quatre prestataires et mêmes effectifs.

Les 584 hôtes NS/MX non reconnus par le catalogue restent comptés comme « inconnus » et ne sont **pas** attribués : le résultat ne surestime pas la couverture. Les 108 organisations sans correspondance de suffixe public ne sont pas comptées comme dépendantes d'un prestataire.

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
  test/provider-spof.test.ts test/provider-spof-api.test.ts \
  test/provider-catalogue-coverage.test.ts test/securite-couverture.test.ts
```

Résultat observé : **17 tests, 17 réussis, 0 échec, 61,6 s**. `tsc --noEmit` vert (5,6 s). Comportements couverts : comptage d'organisations et non de domaines, seuil strict, filtre régional, déduplication NS/MX, catégories NS/MX, classement déterministe, anonymat, accès public de la route, validation du seuil, couverture de la matrice d'accès, et (tranche 2) attribution des suffixes DNS IONOS, attribution des suffixes de messagerie ajoutés, maintien des hôtes non catalogués comme inconnus.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : filtre SQL sur `org.dept` et tests dédiés (une organisation hors région est exclue du décompte).
- **Sources grises autorisées** : DNS-over-HTTPS public et catalogue de suffixes publics ; aucune donnée personnelle de victime n'est chargée ni exposée.
- **Aucun service payant** : aucune clé API, aucun abonnement.
- **Code et interface en anglais** : modules, clés JSON, messages et commentaires techniques en anglais ; seul ce rapport est en français.
- **`server.ts` inchangé** : 0 ligne de diff (route enregistrée dans le registre unique `routes/index.ts`).
- **Durées mesurées** : mesure en quelques secondes, typecheck en 5,6 s, suite ciblée en 61,6 s (création de la base de test comprise).

## Limites

Le résultat porte sur les 1 285 organisations du référentiel qui disposent d'un domaine suivi, et non sur la totalité des 1,67 million d'organisations : une organisation sans domaine observable ne peut pas être rattachée à un prestataire. La dépendance mesurée est une dépendance de service constatée sur des enregistrements publics, pas une preuve de panne réelle ni de contrat exclusif. Les suffixe non catalogués sont explicitement comptés comme inconnus plutôt que devinés. Après la tranche 2, 584 hôtes et 108 organisations restent ainsi non attribués ; les hôtes clients de filtrage et les infrastructures locales ne sont pas nommés comme prestataires.
