# Chaîne de preuve d'un événement

Chaque ligne de `event` doit pouvoir être remontée, sans hypothèse, jusqu'à
**la source qui l'établit** et **au run de collecte qui l'a produit**. Depuis
la migration `db/migrate-206-event-proof-chain.sql`, la base refuse un
événement incomplet.

## Ce que porte un événement

| Colonne | Ce qu'elle dit | Vers quoi elle pointe |
|---|---|---|
| `source_id` | qui établit le fait | `source.id` — et sa `license` |
| `source_url` | la pièce citée (article, avis, page) | l'URL de l'item ; `urn:source:<id>` s'il n'y en a pas |
| `evidence->>'run_id'` | quel passage du collecteur a lu la pièce | `collector_run.id` |

`collector_run.kind` nomme la nature du run :

- `live` — collecte réseau planifiée (générique, flux live, collecteurs dédiés) ;
- `scan` — détection active (typosquat/phishing) ;
- `ingest` — poussée HTTP (`POST /api/ingest`) ;
- `analyst` — promotion d'une revendication par un analyste ;
- `import` / `replay` — import de corpus, rejeu de la projection archivée ;
- `backfill` — run de reconstruction créé par la migration 206 pour les lignes
  antérieures. Il date la reconstruction de la preuve, pas une collecte.

Seuls `live`, `scan` et `ingest` comptent comme collecte dans les décisions de
santé (plan de collecte, `lireSanteSource`, supervision, alerte de source
muette) : une promotion ou un rejeu ne doit pas faire passer une source cassée
pour saine.

## Comment c'est imposé

Un `CHECK` PostgreSQL ne peut pas interroger une autre table. La contrainte se
compose donc de deux parties :

1. **Présence** — deux `CHECK` validés, visibles dans `pg_constraint` :
   - `event_source_url_required` : `source_url IS NOT NULL AND btrim(source_url) <> ''` ;
   - `event_run_id_required` : `evidence` est un objet et `evidence->>'run_id'`
     est un entier.
2. **Résolution** — le trigger `event_proof_chain` (avant chaque insertion ou
   mise à jour de `evidence`) vérifie que le run cité existe dans
   `collector_run` ; sinon il lève `foreign_key_violation`.

Le trigger `collector_run_cited_guard` refuse la suppression d'un run encore
cité. La rétention purge donc les runs **non cités** (`maintenance/retention.ts`),
et un événement conservé garde toujours son collecteur.

## Comment un producteur s'y conforme

`apps/api/src/collecte/runs.ts` fournit `openRun`, `closeRun`, `withRunId`, et
leurs variantes transactionnelles (`openRunWith`, `closeRunWith`). L'ordre est
contraignant : **ouvrir le run avant d'écrire le premier événement**, citer son
identifiant, puis le clore avec les compteurs réels.

```ts
const runId = await openRun(source.id, "live");
try {
  // ... admissions ...
  await query(
    `INSERT INTO event (..., source_url, evidence)
     VALUES (..., $n, $m::jsonb)`,
    [..., link || `urn:source:${source.id}`,
     JSON.stringify(withRunId({ feed: source.name }, runId))],
  );
} finally {
  await closeRun(runId, { itemsIn, itemsNew });
}
```

Écrire les événements puis créer le run ne permet plus de le citer : c'est la
raison pour laquelle les collecteurs ont été réordonnés (générique, live,
Hermes, CERT-FR MISP, communiqués, phishing, promotion, ingest HTTP, scripts).

## Lignes antérieures à la 206

La migration complète les lignes existantes avant de valider ses contraintes :

- `source_url` : URL de l'item si `evidence` en porte une (`url`, `link`,
  `sourceUrl`, `url_bodacc`), sinon l'URL du flux (`source.url`) ;
- `evidence.run_id` : un run `backfill` par source, créé pour l'occasion.

Aucune URL n'est inventée et aucun run ne prétend avoir collecté ce qu'il n'a
pas vu : le `kind` le dit.

## Vérifier

`db/checks.sql`, section 14 :

```sql
SELECT count(*) FROM event
 WHERE at >= now() - interval '30 days'
   AND (source_url IS NULL OR evidence->>'run_id' IS NULL);   -- doit rendre 0
```

Le test `apps/api/test/event-proof-chain.test.ts` exerce le refus d'un insert
incomplet (sans URL, sans run, run inexistant) et la protection d'un run cité.
