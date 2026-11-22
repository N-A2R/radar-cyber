# Chemin d'attaque le plus court — rapport de livraison (2026-11-22)

## Objectif et résultat

Une requête doit répondre « par quels intermédiaires un groupe atteint une
organisation de Nouvelle-Aquitaine » en moins de 500 ms.

**OBJECTIF : atteint — p95 173,3 ms / 500 ms** (p50 24,9 ms ; pire cas 419 ms ;
183 requêtes, toutes sous la cible, 183 chemins trouvés sur 183).

Commande reproductible (base réelle, lecture seule) :

```bash
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm measure:attack-path
```

Brut : `bench/results/attack-path.json` (horodaté, 61 groupes × 3 appels après un échauffement, route Fastify réelle via `app.inject`).
Durée totale de la commande : 11,9 s.

## État réel de départ

Mesuré dans la base au moment du relevé, pas estimé :

| Jeu | Lignes |
|---|---:|
| organisations | 1 673 220 |
| sources | 463 |
| événements | 27 899 |
| entités du graphe | 28 605 |
| relations du graphe | 56 812 |
| groupes distincts | 61 |

La mission annonçait 312 sources : le relevé réel en compte 463. Le chemin ne
dépend pas du nombre total d'organisations : la projection ne contient que les
212 organisations effectivement référencées par un événement.

## Requête livrée

`GET /api/attack-path?group=<nom>&org=<id>&maxHops=<1..8>` (par défaut 5 sauts).
Le champ `org` est facultatif : sans lui, la requête cherche l'organisation NA
la plus proche ; avec lui, elle cherche le chemin vers cette organisation.

Réponse (champs en anglais) : `found`, `hops`, `path`, `links` (type de chaque
relation), `nodes`, `intermediaries` (nœuds entre les deux extrémités), `target`
et `tookMs`.

Le chemin est calculé par une CTE récursive bornée sur `graph_relation`, dans
l'ordre `claims` → `reported_by` → `reported_by` → `targeted_by`, ou par le lien
direct `attributed_to`. Le classement `ORDER BY depth, path LIMIT 1` garantit le
chemin le plus court, puis le plus petit en cas d'égalité. Les nœuds « famille »
sont volontairement exclus : un seul d'entre eux ouvre des milliers d'événements
et faisait passer le balayage à plusieurs millions de lignes pour cinq sauts.

Exemple réel mesuré sur `group:lockbit3` :

```
group:lockbit3 → event:126771 → source:ransomlook → event:23035 → org:1949332
   claims         reported_by       reported_by       targeted_by
```

Les intermédiaires sont donc l'événement revendiqué, la source qui l'a rapporté
et l'événement qui vise l'organisation. Ce sont des relations **mesurées** dans
le graphe : le chemin ne prouve pas une action d'attaque, il montre la chaîne de
renseignement la plus courte entre une revendication et une victime NA.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : les 13 départements de la région filtrent
  l'organisation d'arrivée ; une cible hors région est refusée (400).
- **Sources grises autorisées** : aucun filtre sur `source.family` ; un test
  vérifie qu'une source `leaks` apparaît bien comme intermédiaire.
- **Aucune donnée personnelle de victime** : les titres d'événements ne sont
  jamais exposés (les nœuds `event` portent un libellé dérivé de leur identifiant
  et leurs seules propriétés non personnelles : famille, date, sévérité). Un test
  insère un titre nominatif et vérifie qu'il n'apparaît pas dans la réponse.
- **Aucun service payant** : PostgreSQL embarqué/auto-hébergé, aucun appel réseau
  supplémentaire.
- **Code et interface en anglais** : route, paramètres, champs JSON, messages
  d'erreur et commentaires des nouveaux fichiers sont en anglais ; le présent
  rapport est en français.
- **`server.ts` inchangé** : 0 ligne de diff. La route est enregistrée dans le
  registre unique `routes/index.ts` (2 lignes) et la règle d'accès publique dans
  `security/rbac.ts` (1 ligne).
- **Aucune commande de plus de 60 s** : bench 11,9 s, test ciblé 1,8 s,
  typecheck 6,2 s.

## Vérifications

- 9 tests, un par comportement, dans `apps/api/test/attack-path.test.ts` :
  chemin le plus court et intermédiaires ordonnés, périmètre NA, cible explicite,
  attribution directe préférée, absence de données personnelles, source grise,
  paramètres invalides, groupe inconnu, borne `maxHops`. Tous verts sur une base
  de test éphémère.
- 32 tests de contrat HTTP et de couverture de sécurité verts, dont « toutes les
  routes enregistrées ont une règle de sécurité ».
- `tsc --noEmit` vert.

## Limites assumées

- Profondeur maximale 5 sauts par défaut (8 au plus sur demande) : au-delà, la
  requête répond `found: false` plutôt que de parcourir tout le graphe.
- Les liens `dns_link`, `resolves_to` et `located_in` ne sont pas traversés :
  ils n'établissent pas de chaîne de revendication entre un groupe et une
  organisation. Le périmètre est volontairement celui des faits observés.
- La mesure porte sur les 61 groupes déjà présents dans la projection ; un
  groupe sans relation renvoie une réponse vide et reste compté dans le bench.

## Prévol

Aucune PR ni aucun commit ne livrait cette requête avant cette tranche. Les PR
#290 et #361 construisent le graphe temporel, sans requête de chemin ni objectif
de latence. La branche `ext/chantier-o2` part donc de `origin/main` au commit
`4343e1f`, sans écraser le travail des tranches précédentes.
