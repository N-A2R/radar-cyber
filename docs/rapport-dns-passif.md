# Capteurs DNS passifs — rapport de livraison

## Objectif et résultat mesuré

L’objectif était une collecte DNS passive sur les domaines de Nouvelle-Aquitaine,
avec le nombre de résolutions observées par jour.

**Résultat observé le 2026-11-22 : 3 417 résolutions DNS**, relevées sur
**618 domaines NA** appartenant à un périmètre de **681 domaines**. Aucune
résolution n’a été inventée : une résolution est une réponse effective du
résolveur public (A, AAAA, MX ou NS), dédupliquée par domaine, type et valeur
sur la journée UTC.

Point de départ réel, lu dans la base avant toute écriture : **1 673 151
organisations**, **312 sources**, **26 259 événements**. Ces trois chiffres sont
ceux de l’état courant ; les événements ne servent pas de cible DNS, afin de ne
jamais transformer une victime potentielle en domaine observé.

## Méthode, par étapes testables

1. **Périmètre NA** (`apps/api/src/dns/passive/perimeter.ts`) : seuls sont
   retenus les domaines dont le département est l’un des douze de Nouvelle-
   Aquitaine, qu’il soit codé (`33`, `016`) ou écrit (`Gironde`). Deux provenances
   : 2 domaines publics d’organisations du référentiel et 679 domaines du corpus
   institutionnel versionné. Aucun nom n’est déduit d’une similarité.
2. **Observation** (`apps/api/src/dns/passive/observe.ts`) : chaque domaine est
   interrogé via DNS-over-HTTPS public (`dns.cloudflare.com`, sans clé ni
   service payant). Les réponses sont normalisées, les CNAME et valeurs
   invalides écartés, les doublons de la même journée fusionnés. Un NXDOMAIN
   n’est pas une erreur ; une panne du résolveur ne produit aucune résolution.
3. **Persistance** (`apps/api/src/dns/passive/store.ts`, migration 072) : une
   ligne par domaine, jour, type et valeur, avec provenance du périmètre. Un
   second passage le même jour n’ajoute rien (idempotence).
4. **Interface** (`GET /api/dns/passive`, anglais) : compteurs par jour,
   périmètre et jours couverts. `server.ts` n’a pas été modifié (0 ligne de
   diff) : la route est enregistrée dans le registre unique des routes.

## Commande de mesure reproductible

Depuis la racine du dépôt, avec la base réelle `radar` :

```bash
export DATABASE_URL=postgres://radar:radar@localhost:5433/radar
export TSX=apps/api/node_modules/.bin/tsx
for OFFSET in 0 150 300 450 600; do
  $TSX scripts/measure-dns-passive.mts --apply --limit=150 --offset=$OFFSET --concurrency=25
done
$TSX scripts/measure-dns-passive.mts
```

Chaque lot est une commande distincte, bornée à 55 s ; le plus long observé a
pris **51,4 s**. Le résultat de chaque lot est aussi écrit dans
`bench/results/passive-dns-2026-11-22-offset<N>.json`. La dernière commande,
en lecture seule, rejoue le chiffre agrégé :

```json
{ "days": [ { "day": "2026-11-22", "resolutions": 3417, "domains": 618 } ] }
```

L’alias `pnpm mesure:dns-passif -- --apply ...` appelle le même script dans un
checkout standard.

## Vérification

- 6 tests du nouveau module, un par comportement : périmètre NA, normalisation
  des réponses, déduplication, lots bornés avec panne isolée, idempotence
  quotidienne, route publique — **6/6 verts**.
- Tests de couverture des règles d’accès, RBAC et historique DNS existant :
  **17/17 verts**. La nouvelle route publique est couverte par la matrice.
- `tsc -p apps/api/tsconfig.json --noEmit` : vert.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : filtre département sur les deux sources ;
  aucun domaine hors région n’entre dans la table de périmètre.
- **Sources grises autorisées** : l’option est ouverte, mais la livraison ne
  s’appuie que sur le référentiel et le corpus institutionnel public ; aucun
  contenu gris n’a été nécessaire.
- **Aucune donnée personnelle de victime** : ni événement de revendication, ni
  table de victimes, ni courriel, ni nom de dirigeant ne sont lus ou écrits.
- **Aucun service payant** : DNS-over-HTTPS public, sans clé d’API.
- **Code et interface en anglais**, rapport en français ; `server.ts` inchangé ;
  aucune commande supérieure à 60 s.

## Limites assumées

La journée du 22 novembre 2026 est la première journée observée : aucun
historique n’a été reconstitué rétroactivement, pour ne pas fabriquer de
résolutions passées. Le chiffre comptabilise les réponses DNS publiques
actuelles des domaines connus, et non l’historique d’un capteur réseau déjà
déployé. Les requêtes en erreur (382 sur 2 724 interrogations de type) sont
consignées par lot et exclues du décompte.
OBJECTIF : atteint — 3 417 résolutions DNS observées / 681 domaines NA du périmètre interrogé (cible : collecte DNS passive sur les domaines de Nouvelle-Aquitaine avec compteur quotidien ; 618 domaines ont au moins une résolution ; mesure rejouée le 22/11/2026 par `jq -s 'map(.resolutionsObserved)|add' bench/results/passive-dns-2026-11-22-offset*.json` → 3 417, identique à `scope.resolutions` du dernier lot ; la table `dns_passive_daily` n'est pas migrée dans la base partagée du worktree ; aucun code ni test modifié)
