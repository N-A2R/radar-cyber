#!/usr/bin/env -S npx tsx
/**
 * Rejoue le critère de sortie de la tranche « attribuer les revendications ».
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/verifie-attributions-claims.mts
 *
 * Sortie brute : le compte Admiralty exigé (>= 50), la preuve qu'une
 * revendication sans preuve reste « non attribué », et l'audit conservé.
 * Code de sortie 1 si l'un des contrôles échoue.
 */
process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";

const { closePools, query, withClient } = await import("../apps/api/src/db.js");

try {
  const colonnes = await query<{ column_name: string }>(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'attribution'
     ORDER BY ordinal_position
  `);
  const noms = colonnes.rows.map((row) => row.column_name);
  console.log("colonnes de attribution :", noms.join(", "));
  const attendues = ["claim_id", "groupe", "code_admiralty", "evidence_url", "auteur", "updated_at"];
  const manquantes = attendues.filter((nom) => !noms.includes(nom));

  const critere = await query<{ count: string }>(
    "SELECT count(*)::text AS count FROM attribution WHERE code_admiralty ~ '^[A-F][1-6]$'",
  );
  const reelles = await query<{ count: string }>(`
    SELECT count(*)::text AS count FROM attribution
     WHERE code_admiralty ~ '^[A-F][1-6]$' AND groupe <> 'non attribué' AND evidence_url IS NOT NULL
  `);
  console.log("SELECT count(*) FROM attribution WHERE code_admiralty ~ '^[A-F][1-6]$' :");
  console.log(critere.rows[0]?.count ?? "0");
  console.log("dont attributions réelles (groupe reconnu + preuve) :", reelles.rows[0]?.count ?? "0");

  const sansPreuve = await query<{ id: string }>(`
    SELECT id::text FROM leak_claim
     WHERE evidence_url IS NULL OR btrim(evidence_url) = ''
     ORDER BY id LIMIT 1
  `);
  const claimId = sansPreuve.rows[0]?.id;
  let groupeSansPreuve = "aucune revendication sans preuve dans la base";
  let refusModification = "non testé";
  if (claimId) {
    const etat = await query<{ groupe: string; code_admiralty: string }>(`
      SELECT COALESCE(a.groupe, 'non attribué') AS groupe,
             COALESCE(a.code_admiralty, 'F6') AS code_admiralty
        FROM revendication_attribuee a WHERE a.claim_id = $1
    `, [claimId]);
    groupeSansPreuve = `${etat.rows[0]?.groupe} / ${etat.rows[0]?.code_admiralty}`;

    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await client.query(`
          INSERT INTO attribution (claim_id, groupe, code_admiralty, evidence_url, auteur)
          VALUES ($1, 'non attribué', 'F6', NULL, 'systeme:verification@1')
          ON CONFLICT (claim_id) DO NOTHING
        `, [claimId]);
        await client.query(`
          UPDATE attribution SET groupe = 'LockBit 3.0', code_admiralty = 'B2' WHERE claim_id = $1
        `, [claimId]);
        refusModification = "ECHEC : l attribution sans preuve a pu être modifiée";
      } catch (err) {
        const code = err instanceof Error && "code" in err ? err.code : "inconnu";
        refusModification = `refusée (SQLSTATE ${code})`;
      } finally {
        await client.query("ROLLBACK");
      }
    });
  }
  console.log("revendication sans preuve (groupe / code) :", groupeSansPreuve);
  console.log("tentative d attribution sans preuve :", refusModification);

  const audit = await query<{ total: string; contestations: string }>(`
    SELECT count(*)::text AS total,
           count(*) FILTER (WHERE operation = 'UPDATE')::text AS contestations
      FROM attribution_audit
  `);
  console.log("lignes dans attribution_audit :", audit.rows[0]?.total ?? "0",
    "(dont contestations :", audit.rows[0]?.contestations ?? "0", ")");

  const atteint = Number(critere.rows[0]?.count ?? 0) >= 50 && manquantes.length === 0;
  const preuveOK = groupeSansPreuve.startsWith("non attribué / F6") && refusModification.startsWith("refusée");
  const auditOK = Number(audit.rows[0]?.total ?? 0) > 0;
  console.log(manquantes.length === 0 ? "colonnes : OK" : `colonnes manquantes : ${manquantes.join(", ")}`);
  console.log(atteint ? "cible >= 50 : ATTEINTE" : "cible >= 50 : NON ATTEINTE");
  console.log(preuveOK ? "sans preuve = non attribué : OK" : "sans preuve = non attribué : ECHEC");
  console.log(auditOK ? "audit conservé : OK" : "audit conservé : ECHEC");
  if (!atteint || !preuveOK || !auditOK) process.exitCode = 1;
} finally {
  await closePools();
}
