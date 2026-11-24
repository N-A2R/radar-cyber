#!/usr/bin/env -S npx tsx
/**
 * Remplit `attribution` depuis les revendications déjà collectées.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/backfill-claim-attributions.mts
 *
 * Idempotent : une seconde exécution ne réécrit pas les lignes identiques et
 * ne produit donc aucun audit supplémentaire. Le libellé libre de la
 * revendication sert uniquement à chercher un groupe dans le catalogue public
 * `leak_site` ; il n'est jamais copié tel quel. Aucune victime n'est lue.
 */
import {
  attribuerRevendication,
  type GroupeConnu,
} from "../apps/api/src/attribution/claim-attribution.js";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";
const { closePools, query, withTransaction } = await import("../apps/api/src/db.js");

type ClaimRow = {
  id: string;
  group_name: string;
  evidence_url: string | null;
  source: string;
  corroboration_score: number | null;
  published_at: Date | null;
};

type GroupRow = { slug: string; group_name: string };

const SQL_CLAIMS = `
  SELECT id::text, group_name, evidence_url, source,
         corroboration_score, published_at
    FROM leak_claim
   ORDER BY id
`;

const SQL_GROUPS = `
  SELECT DISTINCT slug, group_name
    FROM leak_site
   WHERE btrim(slug) <> '' AND btrim(group_name) <> ''
   ORDER BY slug
`;

const SQL_WRITE = `
  INSERT INTO attribution (claim_id, groupe, code_admiralty, evidence_url, auteur)
  SELECT * FROM unnest($1::bigint[], $2::text[], $3::text[], $4::text[], $5::text[])
  ON CONFLICT (claim_id) DO UPDATE
     SET groupe         = EXCLUDED.groupe,
         code_admiralty = EXCLUDED.code_admiralty,
         evidence_url   = EXCLUDED.evidence_url,
         auteur         = EXCLUDED.auteur,
         updated_at     = now()
   WHERE (attribution.groupe, attribution.code_admiralty, attribution.evidence_url, attribution.auteur)
      IS DISTINCT FROM (EXCLUDED.groupe, EXCLUDED.code_admiralty, EXCLUDED.evidence_url, EXCLUDED.auteur)
`;

async function main(): Promise<void> {
  const [claims, groupes] = await Promise.all([
    query<ClaimRow>(SQL_CLAIMS),
    query<GroupRow>(SQL_GROUPS),
  ]);

  const catalogue: GroupeConnu[] = groupes.rows.map((row) => ({
    slug: row.slug,
    nom: row.group_name,
  }));
  if (catalogue.length === 0) throw new Error("Catalogue leak_site vide : aucune attribution possible");

  const ids: string[] = [];
  const groupesAttribues: string[] = [];
  const codes: string[] = [];
  const preuves: (string | null)[] = [];
  const auteurs: string[] = [];
  let attribuees = 0;

  for (const claim of claims.rows) {
    const resultat = attribuerRevendication({
      groupeLibre: claim.group_name,
      evidenceUrl: claim.evidence_url,
      source: claim.source,
      corroboration: claim.corroboration_score,
      datePublication: claim.published_at,
      groupesConnus: catalogue,
    });
    ids.push(claim.id);
    groupesAttribues.push(resultat.groupe);
    codes.push(resultat.codeAdmiralty);
    preuves.push(claim.evidence_url?.trim() ?? null);
    auteurs.push(resultat.auteur);
    if (resultat.groupe !== "non attribué") attribuees += 1;
  }

  await withTransaction(async (client) => {
    const taille = 5000;
    for (let debut = 0; debut < ids.length; debut += taille) {
      const fin = Math.min(debut + taille, ids.length);
      await client.query(SQL_WRITE, [
        ids.slice(debut, fin),
        groupesAttribues.slice(debut, fin),
        codes.slice(debut, fin),
        preuves.slice(debut, fin),
        auteurs.slice(debut, fin),
      ]);
    }
  });

  const mesure = await query<{ total: string; attribuees: string; non_attribuees: string; auditee: string }>(`
    SELECT count(*)::text AS total,
           count(*) FILTER (WHERE code_admiralty ~ '^[A-F][1-6]$')::text AS attribuees,
           count(*) FILTER (WHERE groupe = 'non attribué')::text AS non_attribuees,
           (SELECT count(*)::text FROM attribution_audit) AS auditee
      FROM attribution
  `);
  console.log(JSON.stringify({
    catalogues: catalogue.length,
    revendications: claims.rows.length,
    attribueesCalculees: attribuees,
    ...mesure.rows[0],
  }, null, 2));
}

try {
  await main();
} finally {
  await closePools();
}
