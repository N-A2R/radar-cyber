/**
 * Attribution hiérarchisée et contestable des revendications.
 *
 * Deux niveaux de preuve : les règles pures (aucune I/O) et les garanties SQL
 * de la migration 217 — absence de preuve, code Admiralty et audit conservé.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  attribuerRevendication,
  CODE_NON_ATTRIBUE,
  estCodeAdmiralty,
  NON_ATTRIBUE,
  type GroupeConnu,
} from "../src/attribution/claim-attribution.js";
import { query, withTransaction } from "../src/db.js";

const GROUPES: GroupeConnu[] = [
  { slug: "lockbit-3-0", nom: "LockBit 3.0" },
  { slug: "qilin", nom: "Qilin" },
];

async function creeRevendication(preuve: string | null): Promise<number> {
  const result = await query<{ id: number }>(
    `INSERT INTO leak_claim (fingerprint, source, site_slug, group_name, victim, evidence_url, published_at)
     VALUES ($1, 'ransomlook', 'test-attribution', 'LockBit 3.0', 'Organisation de test', $2, now())
     RETURNING id`,
    [`test-attribution-${randomUUID()}`, preuve],
  );
  return result.rows[0]!.id;
}

test("sans preuve, une revendication reste non attribuée avec le code F6", () => {
  for (const url of [null, "", "  ", "pas-une-url"]) {
    const resultat = attribuerRevendication({
      groupeLibre: "LockBit 3.0",
      evidenceUrl: url,
      source: "ransomlook",
      corroboration: 3,
      groupesConnus: GROUPES,
    });
    assert.equal(resultat.groupe, NON_ATTRIBUE);
    assert.equal(resultat.codeAdmiralty, CODE_NON_ATTRIBUE);
    assert.equal(resultat.motif, "preuve-absente");
  }
});

test("avec preuve, un groupe reconnu reçoit un code Admiralty hiérarchisé", () => {
  const base = {
    groupeLibre: "LockBit 3.0",
    evidenceUrl: "https://example.invalid/claim/1",
    datePublication: "2026-11-01T00:00:00Z",
    source: "ransomlook",
    groupesConnus: GROUPES,
  };
  const faible = attribuerRevendication({ ...base, corroboration: 0 });
  const moyen = attribuerRevendication({ ...base, corroboration: 1 });
  const fort = attribuerRevendication({ ...base, corroboration: 2 });

  assert.equal(faible.groupe, "LockBit 3.0");
  assert.ok(estCodeAdmiralty(faible.codeAdmiralty));
  assert.equal(faible.codeAdmiralty, "C3");
  assert.equal(moyen.codeAdmiralty, "C2");
  assert.equal(fort.codeAdmiralty, "C1");
  assert.ok(faible.codeAdmiralty > fort.codeAdmiralty, "la hiérarchie se lit dans le code");
});

test("un groupe inconnu n'est pas recopié depuis le champ libre", () => {
  const resultat = attribuerRevendication({
    groupeLibre: "Groupe invented pour le test",
    evidenceUrl: "https://example.invalid/claim/2",
    source: "ransomlook",
    corroboration: 0,
    groupesConnus: GROUPES,
  });
  assert.equal(resultat.groupe, NON_ATTRIBUE);
  assert.equal(resultat.codeAdmiralty, CODE_NON_ATTRIBUE);
  assert.equal(resultat.motif, "groupe-inconnu");
});

test("SQL : une revendication sans preuve ne peut pas être attribuée", async () => {
  const claimId = await creeRevendication(null);
  await query(
    `INSERT INTO attribution (claim_id, groupe, code_admiralty, evidence_url, auteur)
     VALUES ($1, $2, $3, NULL, $4)`,
    [claimId, NON_ATTRIBUE, CODE_NON_ATTRIBUE, "systeme:preuve-manquante@1"],
  );

  const vue = await query<{ groupe: string; code_admiralty: string }>(
    "SELECT groupe, code_admiralty FROM revendication_attribuee WHERE claim_id = $1",
    [claimId],
  );
  assert.equal(vue.rows[0]?.groupe, NON_ATTRIBUE);
  assert.equal(vue.rows[0]?.code_admiralty, CODE_NON_ATTRIBUE);

  await assert.rejects(
    query("UPDATE attribution SET groupe = 'LockBit 3.0', code_admiralty = 'C1' WHERE claim_id = $1", [claimId]),
    { code: "23514" },
    "aucune contestation ne peut attribuer une revendication sans preuve",
  );

  const apres = await query<{ groupe: string }>("SELECT groupe FROM attribution WHERE claim_id = $1", [claimId]);
  assert.equal(apres.rows[0]?.groupe, NON_ATTRIBUE);
});

test("SQL : une contestation valide modifie l'attribution et conserve l'audit", async () => {
  const preuve = "https://example.invalid/claim/3";
  const claimId = await creeRevendication(preuve);
  await query(
    `INSERT INTO attribution (claim_id, groupe, code_admiralty, evidence_url, auteur)
     VALUES ($1, $2, $3, $4, $5)`,
    [claimId, NON_ATTRIBUE, CODE_NON_ATTRIBUE, preuve, "systeme:regle-admiralty@1"],
  );

  await assert.rejects(
    withTransaction((client) => client.query("SELECT contester_attribution($1, $2, $3, $4, $5)", [
      claimId, "Qilin", "Z9", "analyste", "groupe-errone",
    ])),
    { code: "23514" },
    "un code hors Admiralty est refusé",
  );

  await withTransaction((client) => client.query("SELECT contester_attribution($1, $2, $3, $4, $5)", [
    claimId, "Qilin", "b2", "analyste", "groupe-errone",
  ]));

  const attribution = await query<{ groupe: string; code_admiralty: string; auteur: string }>(
    "SELECT groupe, code_admiralty, auteur FROM attribution WHERE claim_id = $1",
    [claimId],
  );
  assert.deepEqual(attribution.rows[0], { groupe: "Qilin", code_admiralty: "B2", auteur: "analyste" });

  const audit = await query<{
    operation: string;
    groupe_avant: string | null;
    groupe_apres: string | null;
    code_avant: string | null;
    code_apres: string | null;
    motif: string | null;
  }>(
    `SELECT operation, groupe_avant, groupe_apres, code_avant, code_apres, motif
       FROM attribution_audit WHERE claim_id = $1 ORDER BY id`,
    [claimId],
  );
  assert.deepEqual(audit.rows.map((row) => row.operation), ["INSERT", "UPDATE"]);
  assert.equal(audit.rows[1]?.groupe_avant, NON_ATTRIBUE);
  assert.equal(audit.rows[1]?.groupe_apres, "Qilin");
  assert.equal(audit.rows[1]?.code_avant, CODE_NON_ATTRIBUE);
  assert.equal(audit.rows[1]?.code_apres, "B2");
  assert.equal(audit.rows[1]?.motif, "groupe-errone");
});
