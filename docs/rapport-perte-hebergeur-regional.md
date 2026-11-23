# Rapport — Perte d'un hébergeur régional en Nouvelle-Aquitaine

OBJECTIF : atteint — **500 organisations de Nouvelle-Aquitaine touchées** par la chute simultanée des 5 principaux hébergeurs et fournisseurs numériques identifiés dans l'état réel (OVHcloud 318, Microsoft 365 125, Google Workspace 75, o2switch 60, Gandi 41 organisations dépendantes).

## Résultat mesuré

| Rang | Hébergeur / fournisseur | Services observés | Organisations NA dépendantes | Domaines concernés |
|---:|---|---|---:|---:|
| 1 | OVHcloud | DNS + messagerie | 318 | 259 |
| 2 | Microsoft 365 | messagerie | 125 | 98 |
| 3 | Google Workspace | messagerie | 75 | 57 |
| 4 | o2switch | DNS + messagerie | 60 | 49 |
| 5 | Gandi | DNS + messagerie | 41 | 35 |

La simulation retire ces cinq acteurs en une seule fois. Le nombre d'organisations touchées est **500**, calculé après déduplication : une organisation dépendant de plusieurs des cinq acteurs n'est comptée qu'une seule fois. La somme des impacts individuels est de 619, soit **119 dépendances croisées** qui ne doivent pas être comptées deux fois. Les 500 organisations représentent 61,8 % des 809 organisations NA observées avec une donnée DNS exploitable.

Le détail agrégé est versionné dans `bench/results/hosting-outage.json`. La route publique `GET /api/na/hosting-outage` expose le même résultat, sans identifiant, ni nom d'organisation, ni domaine.

## État réel de départ

| Fait | Valeur observée | Origine |
|---|---:|---|
| Organisations annoncées par la mission | 1 673 151 | consigne de chantier |
| Organisations (comptage exact) | 1 673 151 | `SELECT count(*) FROM org` |
| Sources | 312 | `SELECT count(*) FROM source` |
| Événements | 26 259 | `SELECT count(*) FROM event` |
| Institutions NA du corpus gelé | 1 442 | `bench/corpus/institutions-complet.jsonl` |
| Institutions rattachées à une organisation NA | 1 178 | jointure sur `org.entity_code` et `org.dept` |
| Domaines avec observation NS/MX | 569 | `dns_passive_resolution` |
| Domaines attribués à un hébergeur connu | 507 | agrégation déterministe |
| Organisations NA observées | 809 | identifiants opaques uniquement |

## Méthode

1. Le corpus institutionnel gelé ne fournit que l'identifiant de l'établissement et son URL publique ; l'hôte du domaine est normalisé. Aucun nom d'établissement, aucune donnée de victime et aucun événement n'est lu.
2. Le rattachement à `org` se fait sur `entity_code`, avec filtre régional **en amont de toute agrégation** sur les 12 départements de Nouvelle-Aquitaine (16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87). Seuls les identifiants numériques opaques sortent de la base.
3. Les enregistrements NS et MX réels sont lus dans `dns_passive_resolution`. Aucun appel DNS n'est effectué pendant la mesure : aucune clé, aucun service payant, aucune dépendance réseau.
4. Chaque hôte NS (catégories `dns`, `hosting`, `cdn`, `cloud`) et MX (catégories `mail`, `cloud`) est attribué au suffixe public le plus précis du catalogue `HOSTING_CATALOGUE`. Les sources grises (nomenclature publique des suffixes) sont autorisées ; un hôte non reconnu reste « inconnu » et n'est jamais attribué.
5. Les hébergeurs sont classés par nombre d'organisations distinctes décroissant, à ordre égal par nom. La simulation retire les cinq premiers et compte l'union de leurs organisations. Un test par comportement couvre l'attribution, le classement, la déduplication, le filtre régional, les bornes et l'absence de donnée nominative.

## Commande reproductible

```bash
pnpm measure:hosting-outage
```

La commande lit la base réelle, écrit `bench/results/hosting-outage.json` et affiche :

```
OBJECTIF organisations touchées=500 (chute simultanée des 5 principaux hébergeurs : OVHcloud=318, Microsoft 365=125, Google Workspace=75, o2switch=60, Gandi=41)
```

Elle s'exécute en moins de 2 secondes sur l'état réel ; aucune commande du chantier ne dépasse 60 secondes.

## Conformité

- Nouvelle-Aquitaine uniquement : filtre SQL sur les 12 départements, appliqué avant agrégation.
- Sources grises autorisées : corpus institutionnel public, DNS passif public, suffixes publics ; aucun service payant.
- Aucune donnée personnelle de victime : seuls des identifiants d'organisation opaques et des faits DNS publics sont manipulés ; la réponse et le JSON agrégé ne contiennent ni nom, ni domaine, ni identifiant.
- Code et interface en anglais (`simulateHostingOutage`, `GET /api/na/hosting-outage`, commande de mesure) ; le présent rapport est en français.
- `apps/api/src/server.ts` n'est pas modifié (diff de 0 ligne) : la route est enregistrée dans le registre des routes.
- Neuf tests ciblés, un par comportement, verts ; typecheck de l'API propre.

## Limites

Les 375 hôtes NS/MX non reconnus par le catalogue restent comptés comme inconnus : le chiffre de 500 est donc une estimation par attribution explicite, et non une borne haute. Les organisations sans domaine suivi ne peuvent pas être rattachées à un hébergeur et sont exclues du dénominateur observé de 809, mais restent dans le dénominateur régional complet de 1 673 151.
