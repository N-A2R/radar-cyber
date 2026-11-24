/**
 * `/sources/verification` — comptes et liste nommée calculés depuis la table
 * des vérifications, pas depuis des constantes.
 *
 * Isolation : cinq sources jetables et leurs mesures, supprimées dans `after`.
 * La source OK porte deux mesures pour vérifier que seule la plus récente
 * compte : l'historique ne doit pas changer l'état courant.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import sourcesVerificationRoute from "../src/routes/sources-verification.js";

const TAG = `svf${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const IDS = {
  ok: `${TAG}-ok`,
  muette: `${TAG}-muette`,
  morte: `${TAG}-morte`,
  lente: `${TAG}-lente`,
  sans: `${TAG}-sans`,
} as const;
const UA = "test-source-verification/1.0";

let app: FastifyInstance;
let avant: Reponse;

async function creerSource(id: string, nom: string): Promise<void> {
  await query(
    `INSERT INTO source (id, name, family, url, kind) VALUES ($1,$2,'cti','https://exemple.invalid/flux','narrative')`,
    [id, nom],
  );
}

async function mesurer(
  id: string,
  valeurs: { code: number | null; type: string | null; items: number; ms: number; etat: string; motif: string; quand: string },
): Promise<void> {
  await query(
    `INSERT INTO source_verification
       (source_id, url, code_http, content_type, items, derniere_item_at, ms, verifie_at, user_agent, etat, motif)
     VALUES ($1, 'https://exemple.invalid/flux', $2, $3, $4, '2026-11-20T10:00:00Z', $5, $6, $7, $8, $9)`,
    [id, valeurs.code, valeurs.type, valeurs.items, valeurs.ms, valeurs.quand, UA, valeurs.etat, valeurs.motif],
  );
}

before(async () => {
  app = Fastify();
  await app.register(sourcesVerificationRoute);
  await app.ready();
  avant = (await app.inject({ method: "GET", url: "/sources/verification" })).json() as Reponse;
  for (const [cle, id] of Object.entries(IDS)) await creerSource(id, `Source ${cle} (test)`);
  await mesurer(IDS.ok!, {
    code: 404, type: "text/html", items: 0, ms: 100, etat: "morte", motif: "ancienne mesure",
    quand: "2026-11-01T00:00:00Z",
  });
  await mesurer(IDS.ok!, {
    code: 200, type: "application/rss+xml", items: 4, ms: 900, etat: "ok200", motif: "HTTP 200, 4 item(s)",
    quand: "2026-11-21T00:00:00Z",
  });
  await mesurer(IDS.muette!, {
    code: 200, type: "text/html", items: 0, ms: 120, etat: "muette", motif: "HTTP 200 mais 0 item parsé",
    quand: "2026-11-21T00:00:01Z",
  });
  await mesurer(IDS.morte!, {
    code: 503, type: null, items: 0, ms: 320, etat: "morte", motif: "HTTP 503",
    quand: "2026-11-21T00:00:02Z",
  });
  await mesurer(IDS.lente!, {
    code: 200, type: "application/rss+xml", items: 9, ms: 7000, etat: "lente", motif: "HTTP 200, 9 item(s) en 7000 ms",
    quand: "2026-11-21T00:00:03Z",
  });

  // les quatre mesures ci-dessus viennent d'être insérées
});

after(async () => {
  await query("DELETE FROM source_verification WHERE source_id = ANY($1)", [Object.values(IDS)]);
  await query("DELETE FROM source WHERE id = ANY($1)", [Object.values(IDS)]);
  await app.close();
  await closePools();
});

type Reponse = {
  verifie_at: string | null;
  total_sources: number;
  verifiees: number;
  couverture_pct: number;
  resume: { "200": number; muettes: number; mortes: number; lentes: number };
  a_debrancher: { id: string; nom: string; motif: string }[];
  sources: {
    id: string; code_http: number | null; content_type: string | null; items: number;
    derniere_item_at: string | null; ms: number | null; etat: string | null; verifie_at: string | null;
  }[];
};

test("la route publie les quatre comptes et la couverture mesurée", async () => {
  const res = await app.inject({ method: "GET", url: "/sources/verification" });
  assert.equal(res.statusCode, 200);
  const corps = res.json() as Reponse;
  assert.ok(corps.total_sources >= 5);
  assert.equal(corps.verifiees - avant.verifiees, 4);
  assert.deepEqual({
    "200": corps.resume["200"] - avant.resume["200"],
    muettes: corps.resume.muettes - avant.resume.muettes,
    mortes: corps.resume.mortes - avant.resume.mortes,
    lentes: corps.resume.lentes - avant.resume.lentes,
  }, { "200": 1, muettes: 1, mortes: 1, lentes: 1 });
  assert.ok(corps.verifie_at !== null && corps.verifie_at >= "2026-11-21T00:00:03.000Z");
  assert.ok(corps.couverture_pct > 0 && corps.couverture_pct <= 100);
});

test("la liste nommée contient les mortes et les muettes, jamais les lentes", async () => {
  const corps = (await app.inject({ method: "GET", url: "/sources/verification" })).json() as Reponse;
  const ids = corps.a_debrancher.map((s) => s.id);
  assert.deepEqual(ids.sort(), [IDS.muette, IDS.morte].sort());
  assert.ok(corps.a_debrancher.every((s) => typeof s.nom === "string" && s.nom.length > 0 && typeof s.motif === "string"));
  assert.ok(!ids.includes(IDS.lente!));
  assert.ok(!ids.includes(IDS.sans!));
});

test("chaque source porte les six champs de mesure et seule la dernière est lue", async () => {
  const corps = (await app.inject({ method: "GET", url: "/sources/verification" })).json() as Reponse;
  const ok = corps.sources.find((s) => s.id === IDS.ok)!;
  assert.equal(ok.code_http, 200);
  assert.equal(ok.content_type, "application/rss+xml");
  assert.equal(ok.items, 4);
  assert.equal(ok.derniere_item_at, "2026-11-20T10:00:00.000Z");
  assert.equal(ok.ms, 900);
  assert.equal(ok.etat, "ok200");
  const sans = corps.sources.find((s) => s.id === IDS.sans)!;
  assert.equal(sans.etat, null);
  assert.equal(sans.verifie_at, null);
});
