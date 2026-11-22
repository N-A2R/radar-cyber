# Rapport — Sous-traitants numériques et concentration en Nouvelle-Aquitaine

## Chiffre mesuré

**544 organisations de Nouvelle-Aquitaine dépendent d'OVHcloud**, premier prestataire identifié : 46,9 % des 1 160 organisations rattachées à au moins un prestataire.

La carte couvre **1 160 organisations sur 1 285 disposant d'un domaine suivi (90,3 %)**, réparties sur 1 222 domaines observés et 37 prestataires. Les cinq premiers prestataires touchent 79,2 % des organisations attribuées ; 395 organisations dépendent de plusieurs prestataires (DNS chez l'un, messagerie chez l'autre).

OBJECTIF : atteint — 1 160 / 1 285 organisations NA avec domaine rattachées à un prestataire (90,3 %, cible ≥ 90 %) ; 544 dépendent du premier, OVHcloud.

## État réel de départ et mesuré

| Fait | Valeur | Origine |
|---|---:|---|
| Organisations du référentiel (annonce de mission) | 1 673 151 | consigne de chantier |
| Organisations du référentiel (estimation du planificateur PostgreSQL) | 1 672 551 | `pg_class.reltuples`, relevé le 2026-11-22 |
| Sources | 463 | `SELECT count(*) FROM source` |
| Événements | 27 899 | `SELECT count(*) FROM event` |
| Domaines suivis dans l'historique DNS | 1 360 | `SELECT count(*) FROM dns_domaine` |
| Domaines avec une observation NS/MX exploitable | 1 222 | `provider_domain` après collecte |
| Organisations NA portant un de ces domaines | 1 285 | agrégation `provider_domain` + `org.dept` |
| Catalogues de suffixes publics | 127 | `dns_fournisseur` après la migration 066 |

Les douze départements de Nouvelle-Aquitaine sont les seuls retenus : 16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87. Aucune organisation hors région n'entre dans les agrégats, même si son domaine figure dans le référentiel.

## Méthode et commandes reproductibles

1. **Observation gratuite** : `scripts/provider-concentration.mts` interroge uniquement Cloudflare DNS-over-HTTPS (sans clé, sans service payant) pour les enregistrements NS et MX des domaines institutionnels déjà suivis ; il écrit la dernière observation dans `provider_domain` (migration 065). Une panne DoH est consignée comme erreur, jamais transformée en prestataire.
2. **Attribution publique** : `dns_fournisseur` (migration 051, complétée par la migration 066 à partir de suffixes réellement observés) nomme le prestataire par correspondance de suffixe. Une organisation comptant NS et MX chez le même prestataire ne compte qu'une fois pour lui ; les catégories restent visibles comme preuve.
3. **Agrégation pure** : `apps/api/src/analyse/provider-concentration.ts` ne lit ni base ni réseau. Il produit les totaux, la concentration, les points de carte et la liste des hôtes inconnus.
4. **Publication** : `GET /api/na/providers` (route enregistrée dans le registre unique, règle d'accès publique). La réponse ne contient aucun nom d'organisation : seulement des identifiants, des agrégats, des coordonnées et des noms de prestataires.

Commandes (chacune < 60 s) :

```bash
pnpm providers:collect            # 45 s maximum par défaut ; ignore les domaines déjà relevés
pnpm providers:measure            # lecture seule, chiffre ci-dessus
pnpm providers:measure --out=bench/results/provider-concentration.json
```

Sortie observée :

```
provider concentration (Nouvelle-Aquitaine): 1160 organizations attributed across 1222 observed domains and 37 providers (source: provider_domain)
top provider: OVHcloud — 544 organizations (46.9% of attributed organizations)
top-5 coverage: 79.2%; 395 organizations use several providers
scope: 12 departments, 1672551 referential organizations (planner estimate)
```

Le rapport JSON versionné `bench/results/provider-concentration.json` contient les mêmes chiffres, les 12 départements et les points de carte (identifiants uniquement).

## Concentration détaillée

| Prestataire | Organisations | Domaines |
|---|---:|---:|
| OVHcloud | 544 | 528 |
| Microsoft 365 | 273 | 256 |
| Gandi | 108 | 98 |
| Google Workspace | 102 | 96 |
| Hornetsecurity | 96 | 88 |
| o2switch | 73 | 70 |

La Gironde (33) concentre 365 organisations attribuées, dont 156 chez OVHcloud ; la Charente-Maritime (17) en compte 108, dont 63 chez OVHcloud. OVHcloud est le premier prestataire dans 11 des 12 départements (seule exception : les Landes (40), où Gandi arrive en tête avec 21 organisations).

## Tests — un comportement par test

```bash
RADAR_TEST_ADMIN_URL=postgres://radar:radar@localhost:5433/postgres \
  apps/api/node_modules/.bin/tsx apps/api/test/run.ts \
  test/provider-concentration.test.ts test/providers-api.test.ts test/securite-couverture.test.ts
```

Résultat observé : 12 tests réussis, 0 échec. Les tests purs couvrent le filtrage NA, la déduplication NS/MX, l'ignorance d'un type dont la requête a échoué, le comptage du prestataire partagé, l'absence de noms dans la carte et la remontée des hôtes inconnus. Les tests HTTP couvrent l'accès public de la route, le comptage régional et l'anonymat de la réponse. Le test de couverture de sécurité vérifie que la route possède bien une règle d'accès explicite.

Vérification complémentaire : `apps/api/node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json` (sortie vide, code 0). Le diff de `server.ts` est de **0 ligne** : la route passe par le registre `routes/index.ts`, déjà appelé par le serveur.

## Contraintes et limites

- **Nouvelle-Aquitaine uniquement** : filtre sur `org.dept` dans le lanceur SQL et dans l'agrégateur pur (double barrière).
- **Aucune donnée personnelle de victime** : ni `org.name`, ni `dns_domaine.label`, ni contenu d'événement ne sont chargés dans le rapport ; les noms de victimes ne figurent dans aucune table lue.
- **Aucun service payant** : DNS-over-HTTPS public et catalogue de suffixes déjà versions dans le dépôt.
- **Code et interface en anglais** : clés JSON, noms de fonctions, commentaires et messages de sortie en anglais ; seul ce rapport est en français.
- **Commandes < 60 s** : collecte bornée à 45 s par défaut (et limitable à 55 s), mesure en 2 s observée, tests ciblés en 34 s observés.
- **Limites** : 125 organisations et 122 domaines restent non attribués parce que leurs hôtes NS/MX ne correspondent à aucun suffixe public connu ; ils sont listés dans `unknownHosts` pour extension future. Le total de 1 672 551 organisations est une estimation du planificateur PostgreSQL, et non un comptage exact (un `count(*)` complet dépasse 20 s sur cette base partagée).
