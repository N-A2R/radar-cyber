/**
 * Fraîcheur des blogs de fuite rançongiciel.
 *
 * Deux pièges sont couverts ici :
 *   - un site interrogé mais bloqué (HTTP 403) doit rester visible dans la
 *     vue avec `accessible_24h = false` : il entre dans le dénominateur du
 *     taux de succès, jamais dans le numérateur ;
 *   - un site ancien ne doit pas être compté comme interrogé sur 24 h.
 *
 * Le corpus livré par la migration 216 fournit dix sites frais ; les lignes
 * ajoutées par ce test portent un tag unique et sont supprimées ensuite.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { closePools, query } from "../src/db.js";
import { enregistrer, type RapportMoisson } from "../src/collectors/leak-sites.js";

const TAG = `lf${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const IDS = {
  bloque: `${TAG}-403`,
  accessible: `${TAG}-200`,
  ancien: `${TAG}-old`,
};
const SOURCE = "ransomlook";

type Ligne = {
  slug: string;
  http_status: number;
  harvested_at: string;
  interroge_24h: boolean;
  accessible_24h: boolean;
  fraicheur: string;
  etat: string;
};

before(async () => {
  const rapport: RapportMoisson = {
    generatedAt: new Date().toISOString(),
    sites: [{
      source: SOURCE, slug: IDS.bloque, groupName: "Garde 403 (test)",
      siteUrl: "https://exemple.invalid/blog-403", httpStatus: 403, ok: false,
      claims: 0, error: "HTTP 403",
    }],
    claims: [],
    errors: [{ url: "https://exemple.invalid/blog-403", status: 403, message: "HTTP 403" }],
    stats: { sitesHarvested: 0, sitesBlocked: 1, claims: 0, claimsNa: 0, claimsAttached: 0, bySource: {} },
  };
  await enregistrer(rapport);

  await query(
    `INSERT INTO leak_site (source, slug, group_name, site_url, http_status, claim_count, harvested_at)
     VALUES ($1, $2, 'Accessible (test)', 'https://exemple.invalid/blog-200', 200, 2, now()),
            ($1, $3, 'Ancien (test)', 'https://exemple.invalid/blog-old', 200, 1, now() - interval '3 days')`,
    [SOURCE, IDS.accessible, IDS.ancien],
  );
});

after(async () => {
  await query("DELETE FROM leak_site WHERE source = $1 AND slug = ANY($2)", [SOURCE, Object.values(IDS)]);
  await closePools();
});

async function lignes(slugs: string[]): Promise<Map<string, Ligne>> {
  const res = await query<Ligne>(
    `SELECT slug, http_status, harvested_at::text AS harvested_at,
            interroge_24h, accessible_24h, fraicheur, etat
       FROM leak_site_freshness
      WHERE source = $1 AND slug = ANY($2)`,
    [SOURCE, slugs],
  );
  return new Map(res.rows.map((row) => [row.slug, row]));
}

test("le site 403 est interrogé, visible, mais jamais accessible", async () => {
  const parSlug = await lignes([IDS.bloque]);
  const bloque = parSlug.get(IDS.bloque);
  assert.ok(bloque, "le site bloqué doit rester visible dans la vue");
  assert.equal(bloque.http_status, 403);
  assert.equal(bloque.interroge_24h, true);
  assert.equal(bloque.accessible_24h, false);
  assert.equal(bloque.fraicheur, "fraiche");
  assert.equal(bloque.etat, "bloque_403");

  const ecrit = await query<{ http_status: number }>(
    "SELECT http_status FROM leak_site WHERE source = $1 AND slug = $2",
    [SOURCE, IDS.bloque],
  );
  assert.equal(ecrit.rows[0]?.http_status, 403);
});

test("un site ancien sort de la fenêtre de 24 heures", async () => {
  const parSlug = await lignes([IDS.accessible, IDS.ancien]);
  assert.equal(parSlug.get(IDS.accessible)?.accessible_24h, true);
  assert.equal(parSlug.get(IDS.ancien)?.interroge_24h, false);
  assert.equal(parSlug.get(IDS.ancien)?.accessible_24h, false);
  assert.equal(parSlug.get(IDS.ancien)?.etat, "hors_fenetre");
});

test("les seuils du critère sont mesurés sur les sites réellement interrogés", async () => {
  const sites = await query<{ count: string }>(
    "SELECT count(*)::text AS count FROM leak_site WHERE harvested_at > now() - interval '24 hours'",
  );
  const taux = await query<{ taux: string }>(
    `SELECT round(100.0 * count(*) FILTER (WHERE http_status = 200) / count(*))::text AS taux
       FROM leak_site WHERE harvested_at > now() - interval '24 hours'`,
  );
  assert.ok(Number(sites.rows[0]?.count) >= 8, `sites frais : ${sites.rows[0]?.count}`);
  assert.ok(Number(taux.rows[0]?.taux) >= 60, `taux HTTP 200 : ${taux.rows[0]?.taux}`);

  // Le 403 ajouté par ce test est bien dans le dénominateur : le retirer
  // changerait le taux, preuve qu'il n'est pas silencieusement ignoré.
  const sansBloque = await query<{ taux: string }>(
    `SELECT round(100.0 * count(*) FILTER (WHERE http_status = 200) / count(*))::text AS taux
       FROM leak_site
      WHERE harvested_at > now() - interval '24 hours' AND slug <> $1`,
    [IDS.bloque],
  );
  assert.ok(Number(sansBloque.rows[0]?.taux) > Number(taux.rows[0]?.taux));
});
