/**
 * Identité légale des organisations citées : décision pure + effet en base.
 *
 * Aucun appel réseau : les réponses de l'API nationale sont injectées dans le
 * module pur. Le test d'intégration mesure le critère avant/après écriture,
 * sans jamais supposer que la base de test ne contient aucune autre org.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { query, closePools } from "../src/db.js";
import {
  choisirCandidat,
  confirmerParSiren,
  correspondNomLegal,
  estNomDeDomaine,
  nomCandidat,
  requeteRecherche,
  type CandidatSirene,
} from "../src/siren/verification.js";
import {
  compterOrganisationsNonVerifiees,
  declierEvenements,
  enregistrerVerification,
} from "../src/siren/verification-db.js";
import { sirenUnique } from "./helpers/siren.js";

const TAG = `sirc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const orgIds: number[] = [];
const dedupKeys: string[] = [];

function candidat(siren: string, nom: string, dept: string | null = "33", fermeLe: string | null = null): CandidatSirene {
  return { siren, nom, dept, fermeLe };
}

test("le libellé officiel ignore nom commercial et complément rédactionnel", () => {
  assert.equal(nomCandidat("CONTROLE TECHNIQUE (CTM)"), "CONTROLE TECHNIQUE");
  assert.equal(nomCandidat("Université de Limoges — [...]"), "Université de Limoges");
  assert.equal(correspondNomLegal("CONTROLE TECHNIQUE", "CONTROLE TECHNIQUE (CTM)"), true);
  assert.equal(correspondNomLegal("DUBECH GUY", "GUY DUBECH"), true);
  assert.equal(correspondNomLegal("GRAPHIC DESIGN", "MADELEINE KURTSDOTTER"), false);
});

test("un nom de domaine n'est jamais une identité légale", () => {
  assert.equal(estNomDeDomaine("lyon.co.uk"), true);
  assert.equal(estNomDeDomaine("coteg-toulouse"), false);
  assert.equal(estNomDeDomaine("SCHNEIDER ELECTRIC FRANCE"), false);
  assert.equal(estNomDeDomaine("P.A CONSTRUCTION"), false);
});

test("le choix d'un candidat exige un nom exact et un département compatible", () => {
  const siren = sirenUnique(`${TAG}-unique`);
  assert.deepEqual(
    choisirCandidat("ADVEO FRANCE", "77", [
      candidat(siren, "ADVEO FRANCE", "77"),
      candidat(sirenUnique(`${TAG}-autre`), "SCI AQUITAINE MIDI PYRENEES", "77"),
    ]),
    candidat(siren, "ADVEO FRANCE", "77"),
  );
  assert.equal(
    choisirCandidat("ADVEO FRANCE", "77", [candidat(siren, "ADVEO FRANCE", "16")]),
    null,
  );
});

test("l'ambiguïté entre homonymes reste sans décision", () => {
  assert.equal(
    choisirCandidat("DEMOS", "92", [
      candidat(sirenUnique(`${TAG}-demos1`), "DEMOS", "92"),
      candidat(sirenUnique(`${TAG}-demos2`), "DEMOS", "92"),
    ]),
    null,
  );
  const ferme = sirenUnique(`${TAG}-ferme`);
  const ouvert = sirenUnique(`${TAG}-ouvert`);
  assert.equal(
    choisirCandidat("DEMOS", "92", [
      candidat(ferme, "DEMOS", "92", "2003-12-31"),
      candidat(ouvert, "DEMOS", "92"),
    ])?.siren,
    ouvert,
  );
});

test("un alias documenté n'accepte que la raison sociale attendue", () => {
  const departement = "47";
  assert.equal(requeteRecherche("Conseil départemental de Lot-et-Garonne — La présidente"), "DEPARTEMENT DU LOT ET GARONNE");
  const siren = sirenUnique(`${TAG}-cd47`);
  assert.equal(
    choisirCandidat(
      "Conseil départemental de Lot-et-Garonne — La présidente",
      departement,
      [candidat(siren, "CONSEIL DEPARTEMENTAL DE LOT ET GARONNE", departement)],
    ),
    null,
  );
  const attendu = "DEPARTEMENT DU LOT ET GARONNE";
  assert.equal(
    choisirCandidat(
      "Conseil départemental de Lot-et-Garonne — La présidente",
      departement,
      [candidat(siren, attendu, departement)],
    )?.siren,
    siren,
  );
});

test("un SIREN déjà stocké n'est confirmé que par sa propre fiche", () => {
  const siren = sirenUnique(`${TAG}-confirme`);
  assert.equal(confirmerParSiren(siren, "MILLIMAGES", candidat(siren, "MILLIMAGES")), true);
  assert.equal(confirmerParSiren(siren, "MILLIMAGES", candidat(siren, "MADELEINE KURTSDOTTER")), false);
  assert.equal(confirmerParSiren(siren, "MILLIMAGES", candidat(sirenUnique(`${TAG}-faux`), "MILLIMAGES")), false);
});

async function seedOrg(nom: string, siren: string | null = null): Promise<number> {
  const slug = `${TAG}-${orgIds.length}`;
  const { rows } = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, siren, status)
     VALUES ($1,$2,'entreprise',$3,'confirme') RETURNING id`,
    [nom, slug, siren],
  );
  const id = Number(rows[0].id);
  orgIds.push(id);
  const key = `${slug}-event`;
  dedupKeys.push(key);
  const source = await query<{ id: string }>("SELECT id FROM source ORDER BY id LIMIT 1");
  await query(
    `INSERT INTO event (dedup_key, family, assertion_type, title, severity, source_id, org_id, source_url, evidence)
     VALUES ($1,'ransomware','confirmed_incident',$2,4,$3,$4,'https://example.invalid/event','{"run_id":"1"}'::jsonb)`,
    [key, `Incident ${nom}`, source.rows[0].id, id],
  );
  return id;
}

test("la vérification horodatée retire l'organisation du critère, le retrait aussi", async () => {
  const siren = sirenUnique(`${TAG}-base`);
  const orgVerifiee = await seedOrg(`Organisation certifiée ${TAG}`);
  const orgRetiree = await seedOrg(`Organisation retirée ${TAG}`);
  const avant = await compterOrganisationsNonVerifiees();

  assert.equal(
    await enregistrerVerification({
      orgId: orgVerifiee,
      siren,
      nomOfficiel: "NOM OFFICIEL",
      renommer: true,
    }),
    true,
  );
  const apresVerification = await compterOrganisationsNonVerifiees();
  assert.equal(apresVerification, avant - 1);

  const ecrite = await query<{ siren: string; nom: string; verifie: Date | null }>(
    "SELECT siren, name AS nom, siren_verifie_le AS verifie FROM org WHERE id = $1",
    [orgVerifiee],
  );
  assert.equal(ecrite.rows[0]?.siren, siren);
  assert.equal(ecrite.rows[0]?.nom, "NOM OFFICIEL");
  assert.notEqual(ecrite.rows[0]?.verifie, null);

  const evenements = await declierEvenements([orgRetiree], "nom de domaine");
  assert.equal(evenements, 1);
  assert.equal(await compterOrganisationsNonVerifiees(), apresVerification - 1);
  const trace = await query<{ org_id: number | null; motif: string }>(
    `SELECT e.org_id, d.motif
       FROM event e
       LEFT JOIN identite_legale_decrochage d ON d.event_id = e.id
      WHERE e.dedup_key = $1`,
    [`${TAG}-${orgIds.length - 1}-event`],
  );
  assert.equal(trace.rows[0]?.org_id, null);
  assert.equal(trace.rows[0]?.motif, "nom de domaine");
});

after(async () => {
  if (dedupKeys.length) {
    await query("DELETE FROM event WHERE dedup_key = ANY($1::text[])", [dedupKeys]);
  }
  if (orgIds.length) {
    await query("DELETE FROM org WHERE id = ANY($1::int[])", [orgIds]);
  }
  await closePools();
});
