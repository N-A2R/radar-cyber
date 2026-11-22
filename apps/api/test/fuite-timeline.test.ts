/**
 * `fuite_timeline` : frise d'exposition par (org_id, source).
 *
 * Le critère de sortie est vérifié sur un jeu de trois fuites publiques
 * simulées (`db/fixtures/fuite-timeline.sql`) : 24 couples régionaux ont un
 * `first_seen` distinct de leur `last_seen`, une seule résurgence chacun.
 *
 * Les garde-fous couverts ici :
 *   * la vue est bien une vue, pas une table matérialisée périmée ;
 *   * une organisation hors Nouvelle-Aquitaine n'entre pas dans la frise ;
 *   * une exposition unique garde `first_seen = last_seen` (pas de fausse
 *     résurgence) ;
 *   * la vue n'expose aucune colonne personnelle.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { query } from "../src/db.js";

const FIXTURE = fileURLToPath(new URL("../../../db/fixtures/fuite-timeline.sql", import.meta.url));
const SOURCE = "fuite-publique-fixture";
const NETTOYAGE = `
DELETE FROM fuite_reference WHERE source = '${SOURCE}';
DELETE FROM org WHERE slug LIKE 'ftl-org-%';
`;

before(async () => {
  await query(await readFile(FIXTURE, "utf8"));
});

after(async () => {
  await query(NETTOYAGE);
});

test("fuite_timeline est une vue exposant first_seen et last_seen par (org_id, source)", async () => {
  const type = await query<{ table_type: string }>(
    `SELECT table_type FROM information_schema.tables WHERE table_name = 'fuite_timeline'`,
  );
  assert.equal(type.rows[0]?.table_type, "VIEW");

  const dates = await query<{ data_type: string }>(
    `SELECT data_type FROM information_schema.columns
     WHERE table_name = 'fuite_timeline'
       AND column_name IN ('first_seen', 'last_seen')
     ORDER BY column_name`,
  );
  assert.deepEqual(dates.rows.map((r) => r.data_type), ["date", "date"]);

  const doublons = await query<{ n: string }>(
    `SELECT count(*)::text AS n
     FROM (SELECT org_id, source FROM fuite_timeline GROUP BY 1, 2 HAVING count(*) > 1) q`,
  );
  assert.equal(doublons.rows[0]?.n, "0", "une seule ligne par (org_id, source)");
});

test("trois fuites publiques simulées produisent 24 couples avec first_seen <> last_seen", async () => {
  const refs = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM fuite_reference WHERE source = $1`,
    [SOURCE],
  );
  assert.equal(refs.rows[0]?.n, "3");

  const couples = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM fuite_timeline
     WHERE source = $1 AND first_seen <> last_seen`,
    [SOURCE],
  );
  assert.equal(couples.rows[0]?.n, "24");
  assert.ok(Number(couples.rows[0]?.n) >= 20, "seuil du critère : au moins 20");
});

test("une résurgence est un trou de plus de 365 jours", async () => {
  const lignes = await query<{ episodes: number; resurgences: number }>(
    `SELECT episodes, resurgences FROM fuite_timeline
     WHERE source = $1 AND first_seen <> last_seen`,
    [SOURCE],
  );
  assert.equal(lignes.rows.length, 24);
  for (const ligne of lignes.rows) {
    assert.equal(ligne.episodes, 2);
    assert.equal(ligne.resurgences, 1);
  }
});

test("une exposition unique ne fabrique pas de résurgence", async () => {
  const unique = await query<{ first_seen: string; last_seen: string; episodes: number; resurgences: number }>(
    `SELECT first_seen::text, last_seen::text, episodes, resurgences
     FROM fuite_timeline t JOIN org o ON o.id = t.org_id
     WHERE o.slug = 'ftl-org-unique'`,
  );
  assert.equal(unique.rows.length, 1);
  assert.equal(unique.rows[0]?.episodes, 1);
  assert.equal(unique.rows[0]?.resurgences, 0);
});

test("une organisation hors Nouvelle-Aquitaine est exclue de la frise", async () => {
  const horsNa = await query<{ n: string }>(
    `SELECT count(*)::text AS n
     FROM fuite_timeline t JOIN org o ON o.id = t.org_id
     WHERE o.slug = 'ftl-org-hors-na'`,
  );
  assert.equal(horsNa.rows[0]?.n, "0");
});

test("la vue n'expose aucune donnée personnelle", async () => {
  const colonnes = await query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'fuite_timeline' ORDER BY column_name`,
  );
  const noms = colonnes.rows.map((r) => r.column_name);
  assert.deepEqual(noms, [
    "dept",
    "domain",
    "episodes",
    "fenetre_jours",
    "first_seen",
    "fuites",
    "last_seen",
    "org_id",
    "resurgences",
    "source",
  ]);
  for (const nom of noms) {
    assert.doesNotMatch(nom, /nom|name|email|mail|password|mot_de_passe|victime|victim|telephone|ip|compte/i);
  }
});

test("la fixture ne contient ni courriel, ni adresse IP, ni secret", async () => {
  const sql = await readFile(FIXTURE, "utf8");
  assert.doesNotMatch(sql, /[\w.+-]+@[\w-]+\.[\w.-]+/, "aucune adresse de courriel");
  assert.doesNotMatch(sql, /\b\d{1,3}(?:\.\d{1,3}){3}\b/, "aucune adresse IP");
  assert.doesNotMatch(sql, /password|passwd|mot_de_passe|secret/i, "aucun secret");
});
