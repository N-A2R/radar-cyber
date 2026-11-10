# Actifs & qualité des organisations

## Découverte d'actifs

`apps/api/src/assets/discover.ts` — découverte des actifs à partir du domaine déclaré par chaque organisation.

| Source | Ce qu'elle donne | Cadence |
|---|---|---|
| DNS over HTTPS (Cloudflare) | adresses IPv4/IPv6 | 1 requête/s |
| `crt.sh` | sous-domaines observés dans les certificats | 1 requête/s |

Statuts écrits dans `asset.status` :

- `confirme` — le domaine ou l'IP résolu (preuve directe) ;
- `candidat` — un sous-domaine issu d'un certificat (peut être périmé).

### Script

```bash
# dry-run (aucune écriture)
./node_modules/.bin/tsx scripts/discover-assets.mts --limit=10

# application réelle
./node_modules/.bin/tsx scripts/discover-assets.mts --apply [--limit=N] [--org=slug]

# rapport de confiance des sources
./node_modules/.bin/tsx scripts/discover-assets.mts --report=docs/source-health.md
```

Options : `--apply` (écrire), `--limit=N`, `--org=slug`, `--report=fichier`.

L'insertion est idempotente (`ON CONFLICT DO NOTHING`) : relancer ne duplique rien.

**Résultat au 2026-11-10** : 393 domaines, 49 sous-domaines, 10 IP sur 10 orgs testées.

## Nettoyage des organisations

`db/orgs-cleanup.sql` — idempotent et **non destructeur** (aucune suppression).

1. **Départements erronés** — l'import SIRENE avait affecté à certaines orgs le
   département du lot d'import ; correction des cas identifiés (Grenoble, Paris,
   Toulouse, Sousceyrac-en-Quercy).
2. **Orgs sans coordonnées** — centroïde des orgs géolocalisées de la même ville
   (ville normalisée : casse et arrondissement ignorés).
3. **Doublons** — même nom normalisé + même ville, ou même domaine + nom proche
   (`pg_trgm` ≥ 0,6). L'org maîtresse est l'id le plus faible ; les autres
   passent `status='doublon'`. Les événements restent rattachés.
4. **Revue manuelle** — le script liste les domaines partagés (un domaine peut
   couvrir plusieurs établissements : siège vs filiale).

**Résultat au 2026-11-10** : 529 orgs, **0 sans coordonnées**, 7 doublons marqués,
19 domaines partagés à revoir.

Les orgs non complétées par l'étape 2 passent par `scripts/geocode-orgs.mts`
(recherche-entreprises puis BAN).

## Rapport de confiance des sources

`apps/api/src/assets/report.ts` — score sur 100 par source :

| Critère | Points | Mesure |
|---|---|---|
| Fraîcheur | 40 | âge du dernier run |
| Erreurs | 30 | part des échecs sur 30 j |
| Volume | 30 | `items_new` sur 30 j (échelle logarithmique) |

Une source jamais exécutée obtient un score d'erreur neutre (15/30).

## Limites

- `crt.sh` est lent et parfois indisponible : la découverte est best-effort.
- Un sous-domaine de certificat peut être périmé mais encore dans `asset`.
- La résolution DNS ne dit rien de la *propriété* : une IP partagée (hébergeur)
  n'est pas un actif propre de l'org.
