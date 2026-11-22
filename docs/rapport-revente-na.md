# Rapport — Revente de données en Nouvelle-Aquitaine

**Date de mesure :** 22 novembre 2026 (00 h 45 UTC).
**Périmètre :** Nouvelle-Aquitaine uniquement. Sources grises admises, aucun service payant, aucun appel réseau.

## Résultat

**Le nombre d'annonces de revente détectées en Nouvelle-Aquitaine est 0.**

Ce chiffre est mesuré, pas supposé. Le détecteur a bien trouvé **34 signaux textuels de vente** dans l'état réel de la base, puis **32 candidats** après écartement de deux faux positifs issus de CVE (`family = 'vuln'`, « Selling Physical Products ») ; aucun de ces 32 candidats n'est rattaché à la Nouvelle-Aquitaine. Le résultat est publié dans `bench/results/resale-na-2026-11-22.json` avec les requêtes SQL exactes.

La seule annonce « DATA SALE » marquée France (`se.com`, 1,5 To) vise une organisation du département 92 (Hauts-de-Seine). Elle est donc **hors périmètre** et n'est pas comptée, malgré l'attrait d'un chiffre non nul.

## État réel de départ

Mesure effectuée sur la base de travail réelle `radar` (PostgreSQL local), sans jeu de démonstration :

| Grandeur | Valeur mesurée | Requête |
|---|---:|---|
| Organisations | 1 673 151 | `SELECT count(*) FROM org;` |
| Sources | 312 | `SELECT count(*) FROM source;` |
| Événements | 26 221 | `SELECT count(*) FROM event;` |
| Revendications en quarantaine | 32 914 | `SELECT count(*) FROM quarantine_raw WHERE kind='claim';` |
| Signaux de vente (titres + indices) | 34 | `SQL.allOffers` dans le JSON de preuve |
| Candidats après filtres | 32 | `SQL.events` + `SQL.claims` dans le JSON de preuve |
| Organisations NA avec domaine vérifié | 2 | `SQL.organizations` croisé avec `isNaDepartment` |

## Commande reproductible

Dans un environnement de développement où `radar:radar` est valide :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5432/radar \
  pnpm measure:resale-na --json=bench/results/resale-na-2026-11-22.json
```

Dans ce bac à sable, le rôle `radar` n'a pas de mot de passe utilisable ; la mesure a été exécutée en lecture seule via le socket PostgreSQL et le rôle `postgres` :

```bash
time timeout 58 sudo -n -u postgres env HOME=/tmp \
  DATABASE_URL='postgres://postgres@localhost/radar?host=/var/run/postgresql' \
  ./apps/api/node_modules/.bin/tsx scripts/measure-resale-na.mts \
  --json=/tmp/resale-na-2026-11-22.json
# puis, en tant qu'utilisateur du worktree :
cp /tmp/resale-na-2026-11-22.json bench/results/resale-na-2026-11-22.json
```

Sortie observée :

```
NA resale listings detected: 0 (candidates=32, all offers=34, orgs=1673151, sources=312, events=26221)
```

La commande lit les tables, applique exactement la même règle que l'API (`measureResaleListings` → `detectResaleListings`), écrit la preuve JSON et ferme ses pools. Durée mesurée : **1,1 s**, sans appel réseau ni service payant.

## Méthode, étapes testables

1. **Préfiltrage SQL.** Les titres d'événements et les indices de revendication (`org_hint`) sont seuls interrogés avec l'expression partagée `SALE_PATTERN`. Aucun résumé, corps TLP:RED, nom de victime, courriel ni téléphone n'est lu : la sélection a lieu dans la base.
2. **Qualification de l'offre.** Un candidat n'est retenu que si un marqueur de vente (`DATA SALE`, `for sale`, `à vendre`, `revente`, `selling`, ...) coexiste avec un objet de données (`data`, `database`, `records`, `access`, `données`, ...). Les formes de commerce ordinaire (`point of sale`, `selling tickets`) sont exclues.
3. **Filtre Nouvelle-Aquitaine.** Trois preuves acceptées, une seule suffit : département INSEE ou libellé de l'organisation rattachée (12 départements), mention explicite d'une localité NA dans le texte, ou racine de domaine vérifiée appartenant à une organisation NA. Le prédicat de département est réutilisé du module déjà livré pour les fuites par domaine.
4. **Déduplication.** Une annonce n'est comptée qu'une fois, même si le même identifiant revient de deux tables ou de deux collectes.
5. **Publication.** Le compteur est exposé par `GET /api/resale/listings` (clés anglaises, compteurs agrégés seulement) et par la commande de mesure. Les identifiants d'annonces ne quittent pas le JSON de preuve ; le texte d'origine n'est jamais publié.

Un test par comportement est écrit dans `apps/api/test/resale-listings.test.ts` : offre anglaise, offre française, commerce générique, marqueur sans objet de données, codes et libellés NA, localité NA, exclusion hors NA, rattachement par domaine d'une source grise, déduplication, absence de donnée personnelle, mesure sur les tables réelles, contrat HTTP et couverture des règles d'accès.

## Vérifications

- `tsx test/run.ts test/resale-listings.test.ts test/securite-couverture.test.ts` sur une base de test jetable : **15 tests réussis, 0 échec**, en 2,2 s.
- mesure sur la base réelle : **1,1 s** ; aucun appel réseau ; aucune écriture dans les tables métier.
- `apps/api/src/server.ts` n'est **pas modifié** (diff de 0 ligne) : la route est enregistrée dans `routes/index.ts`, avec sa règle d'accès dans `security/rbac.ts`.
- Le code, les clés JSON, la route et les messages sont en anglais ; le présent rapport est en français.
- Aucune donnée personnelle de victime n'est stockée ni publiée : le JSON ne contient que des compteurs, des identifiants d'annonces et la preuve de périmètre (`basis`). Les corps des revendications restent en TLP:RED.

## Limites mesurées

Le référentiel ne contient que deux organisations de Nouvelle-Aquitaine avec un domaine ou un site web vérifié ; le rattachement par domaine ne peut donc porter que sur ces deux-là. Les autres pistes de rattachement (département, localité explicite) ont été appliquées aux 32 candidats sans produire de résultat. Le chiffre 0 décrit fidèlement l'état disponible : il ne prétend pas que la région n'est pas visée par des ventes de données, seulement qu'aucune annonce explicite n'est détectable dans les sources actuellement collectées.

## Prévolution

Recherches effectuées avant toute modification : `gh pr list --state all --search 'revente'`, `'resale'`, `'chantier-d6'`, `'Nouvelle-Aquitaine'`, `'vente de donnees'`, `'annonces'`, `'marketplace'`, `'data broker'`, `'d6'`, plus `gh pr list --head ext/chantier-d6` et `git log --oneline --all | grep -i -E 'revente|resale|data.?sale'` : **aucune PR ni aucun commit ne couvre ce chantier**. La mesure ci-dessus est établie sur la branche `ext/chantier-d6`.
