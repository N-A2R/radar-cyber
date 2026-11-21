# Enrichissement du référentiel — domaine, SIREN, secteur, géo

Le référentiel compte **1 673 151 organisations** (mesure locale du
2026-11-21). Quatre champs sont enrichis, avec **une source et un score de
confiance par valeur** : domaine web, SIREN, secteur, géolocalisation.

## Ce qui est livré

- Migration `db/migrate-049-org-enrichissement.sql` : table `org_enrichment`
  `(org_id, champ, valeur jsonb, source, confiance numeric(4,3), details, verifie_le)`.
  Une valeur retenue par organisation et par champ ; la clé primaire empêche
  les doublons. Les colonnes historiques de `org` restent inchangées pour tout
  ce qui est déjà renseigné.
- Logique pure : `apps/api/src/referentiel/enrichissement.ts` (règles, scores,
  parsing, géo, couverture) — réseau injecté, testable hors ligne.
- Accès base : `apps/api/src/referentiel/enrichissement-db.ts` (lecture paginée
  par clé, mesure de couverture, application transactionnelle par lot).
- CLI : `scripts/enrichir-referentiel.mts`.
- Tests : `apps/api/test/enrichissement-referentiel.test.ts` (12 tests, dont un
  test d'intégration base : non-écrasement, provenance, idempotence).

## Usage

```bash
# Rapport seul : aucune écriture, couverture avant/après projetée par champ.
apps/api/node_modules/.bin/tsx scripts/enrichir-referentiel.mts --rapport --limite=5000

# Application : trace la provenance puis remplit les colonnes vides.
apps/api/node_modules/.bin/tsx scripts/enrichir-referentiel.mts --appliquer --champ=siren,geo

# Rodage hors réseau, département ciblé, rapport JSON explicite.
apps/api/node_modules/.bin/tsx scripts/enrichir-referentiel.mts \
  --offline --dept=16,17 --champ=geo --limite=20000 --json=/tmp/enrich.json
```

`pnpm enrichissement:rapport` et `pnpm enrichissement:appliquer` sont des
raccourcis du `package.json`. Le défaut est **le rapport** : `--appliquer` est
la seule porte d'écriture. Options : `--champ=`, `--seuil=0.70`, `--limite=0`
(zéro = toutes), `--dept=`, `--offline`, `--source-siren=api|snapshot`,
`--timeout-ms=5000`, `--concurrence=4`, `--reessais=2`, `--json=chemin`,
`--help`. Le rapport est affiché sur stdout (lignes lisibles + une ligne JSON) ;
`--json` l'écrit en plus dans un fichier, uniquement si demandé.

## Sources, règles et confiance

| Champ | Source (`source`) | Règle | Confiance |
|---|---|---|---|
| Domaine | `http-200:<hôte final>` | Domaine distinctif extrait du nom ou de `website`/`domain`, GET `https://` avec timeout, **HTTP 200 final sur le même domaine** | 0,76 + 0,06 si HTTPS final + 0,08 si la racine figure dans le nom + 0,04 si le candidat vient du nom ; max 0,94 |
| SIREN | `recherche-entreprises-api` | API `recherche-entreprises.api.gouv.fr/search?q=…`, correspondance **exacte** du nom normalisé, un seul SIREN retenu | 0,82 (alias 0,70) + 0,08 département + 0,05 commune + 0,03 entreprise active ; max 0,98 |
| SIREN (repli) | `sirene-snapshot` | Snapshot versionné `db/data/entreprises-na.json` (13 332 fiches), même règle de correspondance | Idem, source distinctive |
| Secteur | même source que le SIREN | Code NAF de la fiche (`6202A` → `62.02A`) ramené à un secteur éditorial | Confiance SIREN − 0,02 |
| Géo | `codes-postaux-communes` | Code postal (fiche SIRENE ou `city`) résolu par `db/data/referentiel-na.json` (4 517 communes, 661 codes postaux) | 0,95 CP + commune ; 0,85 CP unique ; 0,72 CP + commune ambigu ; 0,65 commune la plus peuplée ; 0,80 nom de commune seul |

Toute valeur sous `--seuil` est rejetée. En cas d'égalité entre deux SIREN,
l'attribution est refusée plutôt que choisie arbitrairement. Les fournisseurs
de messagerie, réseaux sociaux et hébergeurs de pages ne sont jamais proposés
comme site officiel ; les hôtes privés (`localhost`, IP RFC1918, `.invalid`, …)
sont refusés avant tout appel HTTP (SSRF).

## Erreurs et états vides

- API muette, 429 ou 5xx : test unique au démarrage, puis `retries` reprises
  avec backoff ; repli automatique sur le snapshot SIRENE, tracé dans le rapport
  (`sources.api.diagnostic`).
- HTTP 403/404, timeout, redirection hors domaine : candidat rejeté et motif
  conservé dans `rejets.parMotif` ; aucun domaine n'est écrit sans 200.
- `--offline` : aucun appel réseau ; les domaines sont sans proposition (état
  vide explicite), SIREN/secteur/géo continuent depuis les snapshots.
- Snapshot absent ou mal formé : tableau vide, message d'état vide, les champs
  dépendants restent non enrichis ; le CLI ne plante pas.
- Aucune organisation à examiner, aucune proposition retenue, base sans table
  de provenance : messages explicites et rapport avec compteurs à zéro.
- Application par lots de 500 : un lot en échec est compté, les autres continuent
  ; le rapport sort avec `application.echecs > 0` et `erreurs` rempli. Chaque lot
  est atomique (provenance + colonne), et les `UPDATE` portent un `WHERE` sur
  champ vide : rejouer `--appliquer` ne réécrit aucune colonne.

## Couverture mesurée avant / après

Mesures du 2026-11-21 sur la base locale `postgres://radar:radar@localhost:5432/radar`
(1 673 151 organisations). « Après » est une **projection** en mode rapport :
le gain s'ajoute aux champs vides constatés avant, sans écriture. Les commandes
sont reproductibles ; les gains sont bornés par le nombre d'organisations
examinées indiqué.

| Champ | Avant (remplis / total) | Organisations examinées | Gain projeté | Après (remplis / taux) |
|---|---:|---:|---:|---:|
| Domaine web | 88 / 1 673 151 (0,01 %) | 22 000 en ligne | +3 (HTTP 200 vérifiés) | 91 (0,01 %) |
| SIREN | 1 605 918 / 1 673 151 (95,98 %) | 5 000 hors ligne | +7 (confiance 0,93–0,98) | 1 605 925 (95,98 %) |
| Secteur | 1 672 782 / 1 673 151 (99,98 %) | 369 hors ligne (tous les manquants) | +1 | 1 672 783 (99,98 %) |
| Géolocalisation | 1 226 538 / 1 673 151 (73,31 %) | 20 000 hors ligne | +18 664 | 1 245 202 (74,42 %) |

La passe domaine a tenté 15 vérifications HTTP pour 22 000 orgs : 3 réponses
200 retenues, 5 aborts/timeout, 3 échecs réseau, 1 HTTP 403, le reste sans
candidat de domaine. Le faible gain domaine n'est pas un défaut du script : sur
1,67 M d'organisations, seules 88 ont déjà un domaine et quelques milliers
portent un nom de domaine dans leur raison sociale.

**Vérification de `--appliquer`** : exécuté sur une base temporaire isolée
(créée depuis `db/init.sql` + migrations, puis supprimée), 7 organisations,
`--offline --champ=siren,secteur,geo` : SIREN 0 → 6, secteur 0 → 6, géo 0 → 6
(85,71 % chacun), 18 valeurs tracées, 18 colonnes remplies, 0 lot en échec.
La couverture y est **remesurée** après écriture, contrairement au mode rapport.
Aucune écriture n'a été faite sur la base de mesure : le jeu live reste intact.
