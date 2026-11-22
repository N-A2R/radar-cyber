# Graphe complet de la Nouvelle-Aquitaine

## Objectif et mesure

Objectif : **au moins 10 000 000 d'arêtes** interrogeables entre organisations,
domaines, IP, ASN, hébergeurs, certificats et incidents.

Résultat mesuré le 2026-11-22 : **11 817 569 arêtes**, 24 types, sur la base
réelle (`org` ≈ 1,67 M, `event` ≈ 27,9 k, `source` ≈ 463).

Commande reproductible (aucun service payant, base locale) :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm mesure:graphe --json=bench/results/graphe-complet-2026-11-22.json
```

Le résultat brut, les requêtes SQL et l'horodatage sont dans
`bench/results/graphe-complet-2026-11-22.json`. Le comptage lit la vue
`graph_complet_edge` définie par `db/migrate-064-graphe-complet.sql`.

## Modèle

Une seule vue, `graph_complet_edge(source_id, target_id, type, evidence)`, où
chaque ligne est une relation **mesurée**, jamais inférée à la volée. Les
identifiants de nœuds sont opaques (`org:…`, `dept:…`, `city:…`, `siren:…`,
`domain:…`, `host:…`, `cert:…`, `ip:…`, `asn:…`, `hoster:…`, `incident:…`,
`event:…`, `source:…`). Aucun nom de victime, titre d'événement ni alias en clair
n'est matérialisé : les alias et les émetteurs de certificats sont hachés (MD5).
Les champs `victim` des revendications ne sont jamais lus.

Répartition (voir le JSON pour le détail complet) : aliases 1 678 051,
catégories d'organisation 1 671 906, départements 1 671 906, secteurs
1 671 889, communes 1 671 704, identifiants SIRENE 1 665 575, SIREN 1 604 767,
tranches d'effectif 161 219, filiations 14 956, domaines 2 586,
hébergement 679, hôtes et certificats 342/342/263, DNS 248, incidents 74/78,
événements 981, ASN/hébergeur 3.

Le filtrage géographique est appliqué à chaque branche : départements INSEE
16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87 pour les organisations ;
`event.regional = true` ou rattachement à une organisation régionale pour les
événements ; `leak_claim.na = true` pour les incidents.

## Interrogation

`GET /api/graph/complet` (public, lecture seule) :

| Paramètre | Effet |
| --- | --- |
| `type` | filtre sur le type d'arête |
| `node` | ego-réseau : l'identifiant est source **ou** cible |
| `kind` | filtre sur le préfixe du nœud cible (`ip`, `cert`, `incident`…) |
| `limit`, `offset` | pagination bornée (1 à 1 000) |
| `stats=true` | ajoute le total et la répartition par type |

La réponse contient `edges`, `nodes` (identifiants + type uniquement) et `meta`.
Les tests `apps/api/test/graphe-complet.test.ts` couvrent un comportement par
test : rattachement régional, exclusion hors région, hachage des alias,
incidents sans donnée personnelle, chaîne domaine → hôte → certificat →
émetteur, résolution DNS, filtres, statistiques et paramètres invalides.

## Contraintes

- Code et interface (SQL, TypeScript, paramètres et réponses JSON) en anglais ;
  ce document et le rapport de livraison sont en français.
- `apps/api/src/server.ts` inchangé : le diff est de **0 ligne** (enregistrement
  de la route dans `routes/index.ts` uniquement).
- Aucune commande de mesure, de test ou de vérification ne dépasse 60 s : la
  mesure complète s'exécute en environ 4 s, chaque test en moins de 100 ms.
- Les sources grises déjà présentes dans la base sont utilisées telles quelles ;
  aucun appel réseau ni service payant n'est ajouté.
- L'ancrage ASN/hébergeur provient d'une observation réelle déjà mesurée dans
  `bench/results/sources-sonde-vague3.json` (AS14061, DigitalOcean) ; il n'est
  inventé aucun autre ASN.
