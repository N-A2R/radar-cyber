/**
 * Qualification ANSSI des fiches prestataires : critère du juge externe,
 * datation de l'extrait, garde-fou SQL et publication publicitaire.
 *
 * Replay : pnpm -F @radar/api test -- test/prestataire-qualifie.test.ts
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import { chargerFichesPrestatairesQualifies } from "../src/qualification/store.js";
import prestatairesQualifiesRoute from "../src/routes/prestataires-qualifies.js";
import { reglePour } from "../src/security/rbac.js";

/** Le critère du juge externe, exécuté tel quel. */
const CRITERE_SQL =
  "SELECT count(*) FROM prestataire_qualifie WHERE reference_anssi IS NULL OR qualifie_le IS NULL OR validite_fin IS NULL OR (validite_fin<current_date AND active);";

const TAG = `qa${Date.now().toString(36)}`;
const ID_EXPIRE = `expire-${TAG}`;
let app: FastifyInstance | null = null;

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM prestataire_qualifie WHERE id = $1", [ID_EXPIRE]);
  await closePools().catch(() => {});
});

test("le critère externe renvoie zéro et vingt fiches NA appuyées par l'extrait daté", async () => {
  const critere = await query<{ count: string }>(CRITERE_SQL);
  assert.equal(critere.rows[0]?.count, "0");

  const fiches = await query<{
    n: string;
    extrait_le: string;
    edite_le: string;
    sha256: string;
  }>(`
    SELECT count(*)::text AS n,
           min(e.extrait_le::text) AS extrait_le,
           min(e.edite_le::text) AS edite_le,
           min(e.sha256_fichier) AS sha256
      FROM prestataire_qualifie p
      JOIN anssi_extrait e ON e.id = p.extrait_id
     WHERE p.region = 'Nouvelle-Aquitaine'
  `);
  assert.equal(fiches.rows[0]?.n, "20");
  assert.equal(fiches.rows[0]?.extrait_le, "2026-11-23");
  assert.equal(fiches.rows[0]?.edite_le, "2026-11-19");
  assert.match(fiches.rows[0]?.sha256 ?? "", /^[0-9a-f]{64}$/);
});

test("une fiche active échue est refusée en base", async () => {
  await assert.rejects(
    query(
      `INSERT INTO prestataire_qualifie
         (id, nom, referentiel, service, reference_anssi, qualifie_le, validite_fin, active, ancrage_regional, extrait_id)
       VALUES ($1, $2, 'PASSI', 'Audit SSI', $3, DATE '2020-01-01', DATE '2020-01-02', true, 'dossier_na', 'catalogue-anssi-2026-11-19')`,
      [ID_EXPIRE, `Fournisseur échu ${TAG}`, `PASSI-${TAG}`],
    ),
    /qualification echue/,
  );
  const apres = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM prestataire_qualifie WHERE id = $1",
    [ID_EXPIRE],
  );
  assert.equal(apres.rows[0]?.n, "0");
});

test("une fiche historique échue n'est pas publiée comme qualifiée", async () => {
  await query(
    `INSERT INTO prestataire_qualifie
       (id, nom, referentiel, service, reference_anssi, qualifie_le, validite_fin, active, ancrage_regional, extrait_id)
     VALUES ($1, $2, 'PASSI', 'Audit SSI', $3, DATE '2020-01-01', DATE '2020-01-02', false, 'dossier_na', 'catalogue-anssi-2026-11-19')`,
    [ID_EXPIRE, `Fournisseur historique ${TAG}`, `PASSI-${TAG}`],
  );

  const toutes = await chargerFichesPrestatairesQualifies();
  const historique = toutes.find((fiche) => fiche.id === ID_EXPIRE);
  assert.equal(historique?.estQualifie, false);
  assert.ok(historique?.referenceAnssi);
  assert.ok(historique?.extrait.extraitLe);

  app = Fastify({ logger: false });
  await app.register(prestatairesQualifiesRoute, { prefix: "/api" });
  await app.ready();
  assert.equal(reglePour("GET", "/api/na/prestataires-qualifies")?.niveau, "public");
  const reponse = await app.inject({ method: "GET", url: "/api/na/prestataires-qualifies" });
  assert.equal(reponse.statusCode, 200, reponse.body);
  const corps = reponse.json<{
    sourcePortee: string;
    total: number;
    fiches: Array<{ id: string; referenceAnssi: string; validiteFin: string; extrait: { url: string } }>;
  }>();
  assert.equal(corps.sourcePortee, "nationale");
  assert.equal(corps.total, 20);
  assert.equal(corps.fiches.some((fiche) => fiche.id === ID_EXPIRE), false);
  for (const fiche of corps.fiches) {
    assert.ok(fiche.referenceAnssi);
    assert.ok(fiche.validiteFin);
    assert.match(fiche.extrait.url, /^https:\/\/messervices\.cyber\.gouv\.fr\//);
  }
});
