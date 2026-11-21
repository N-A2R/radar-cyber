import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attachOrg,
  detectNA,
  enregistrer,
  harvest,
  parseClaim,
  type Claim,
  type RapportMoisson,
  type Reference,
} from "../src/collectors/leak-sites.js";
import { ingestQuery } from "../src/db.js";

const RANSOMLOOK = "https://www.ransomlook.io";

function reference(cities: string[] = []): Reference {
  return { cities: new Set(cities), names: new Map(), domains: new Map() };
}

function claim(victim: string, description: string | null = null): Claim {
  return {
    fingerprint: `test-${victim}`,
    source: "ransomlook",
    siteSlug: "alpha",
    groupName: "Alpha",
    victim,
    country: null,
    sector: null,
    publishedAt: "2026-03-04T12:00:00.000Z",
    description,
    evidenceUrl: null,
  };
}

test("parseClaim: extrait groupe, victime, pays, secteur, date et URL de preuve", () => {
  const parsed = parseClaim({
    post_title: "Hôpital Test",
    group_name: "AlphaLock",
    discovered: "2026-03-04 12:00:00.090511",
    description: "Healthcare, Gironde, France",
    link: "/site/blog?uuid=abc",
  }, "ransomlook");
  assert.ok(parsed);
  assert.equal(parsed.groupName, "AlphaLock");
  assert.equal(parsed.victim, "Hôpital Test");
  assert.equal(parsed.country, "France");
  assert.equal(parsed.sector, "Healthcare");
  assert.equal(parsed.publishedAt, "2026-03-04T12:00:00.090Z");
  assert.equal(parsed.evidenceUrl, `${RANSOMLOOK}/site/blog?uuid=abc`);
});

test("detectNA: commune homonyme sans département NA n'est pas retenue", () => {
  const ref = reference(["avon", "saint paul"]);
  assert.deepEqual(detectNA("Cabinet à Avon, Colorado", ref), []);
  assert.deepEqual(detectNA("City of Saint Paul, Minnesota", ref), []);
});

test("detectNA: commune admise seulement avec un indice locatif", () => {
  const ref = reference(["pau", "bordeaux", "la rochelle", "hours"]);
  assert.deepEqual(detectNA("Victime à Pau", ref), ["commune"]);
  assert.deepEqual(detectNA("Société basée in Bordeaux", ref), ["commune"]);
  assert.deepEqual(detectNA("Bureaux à Paris, Bordeaux et Lille", ref), []);
  assert.deepEqual(detectNA("24 hours remaining", ref), []);
  assert.deepEqual(detectNA("Etablissement de La Rochelle", ref), ["commune"]);
});

test("detectNA: département explicite admis", () => {
  assert.deepEqual(detectNA("Data leak en Gironde", reference()), ["departement"]);
  assert.deepEqual(detectNA("Data leak à Lyon", reference()), []);
});

test("attachOrg: domaine ou nom distinctif, ambiguïté départagée par la commune", () => {
  const bis = { id: 1, name: "Etablissement Test", dept: "79", city: "Niort" };
  const autres = { id: 2, name: "Etablissement Test", dept: "33", city: "Bordeaux" };
  const ref: Reference = {
    ...reference(),
    domains: new Map([["etablissement-test.fr", [bis]]]),
    names: new Map([["etablissement test", [bis, autres]]]),
  };
  assert.deepEqual(attachOrg(claim("etablissement-test.fr"), ref), {
    orgId: 1, orgName: "Etablissement Test", via: "domain",
  });
  assert.deepEqual(attachOrg(claim("Etablissement Test", "à Niort"), ref), {
    orgId: 1, orgName: "Etablissement Test", via: "name",
  });
  assert.equal(attachOrg(claim("Etablissement Test", "sans indice"), ref), null);
});

test("harvest: sites accessibles et bloqués mesurés, victimes NA rattachées", async () => {
  const org = await ingestQuery<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, city, domain, status)
     VALUES ('Victime Pau Test', 'victime-pau-test', 'entreprise', '64', 'Pau',
             'victime-pau-test.fr', 'confirme') RETURNING id`,
  );
  const orgId = org.rows[0].id;
  const fetchJson = async (url: string) => {
    if (url === `${RANSOMLOOK}/api/groups`) return { status: 200, body: ["alpha", "beta"] };
    if (url.endsWith("/api/recent/5000")) {
      return { status: 200, body: [
        { post_title: "victime-pau-test.fr", group_name: "Alpha", discovered: "2026-03-01", description: "Pau" },
        { post_title: "Autre victime", group_name: "Alpha", discovered: "2026-03-02", description: "Gironde" },
        { post_title: "Victime étrangère", group_name: "Beta", discovered: "2026-03-03", description: "Germany" },
      ] };
    }
    if (url.endsWith("/api/posts/2026") || url.endsWith("/posts.json")) return { status: 200, body: [] };
    if (url.includes("/api/group/alpha")) {
      return { status: 200, body: [{ name: "Alpha", locations: [{ slug: "http://alpha.onion" }] }] };
    }
    if (url.includes("/api/group/beta")) return { status: 403, body: null, error: "HTTP 403" };
    return { status: 404, body: null, error: "HTTP 404" };
  };
  const rapport = await harvest({ fetchJson, maxSites: 5, years: [2026] });
  assert.equal(rapport.stats.sitesHarvested, 1);
  assert.equal(rapport.stats.sitesBlocked, 1);
  assert.equal(rapport.stats.claims, 3);
  assert.equal(rapport.stats.claimsNa, 2);
  assert.equal(rapport.stats.claimsAttached, 1);
  assert.ok(rapport.errors.some((e) => e.status === 403));
  assert.equal(rapport.claims.find((c) => c.orgId === orgId)?.naMotifs.includes("rattachement"), true);
});

test("enregistrer: écrit une seule fois les sites et revendications (idempotent)", async () => {
  const org = await ingestQuery<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, status)
     VALUES ('Org Rapport Test', 'org-rapport-test', 'entreprise', '33', 'confirme') RETURNING id`,
  );
  const orgId = org.rows[0].id;
  const une = claim("Org Rapport Test", "à Bordeaux");
  const enrichie = { ...une, fingerprint: `rapport-${Date.now()}`, na: true,
    naMotifs: ["commune", "rattachement"], orgId, orgName: "Org Rapport Test", rattachementVia: "name" as const };
  const rapport: RapportMoisson = {
    generatedAt: new Date().toISOString(),
    sites: [{ source: "ransomlook", slug: "alpha", groupName: "Alpha",
      siteUrl: "http://alpha.onion", httpStatus: 200, ok: true, claims: 1, error: null }],
    claims: [enrichie],
    errors: [],
    stats: { sitesHarvested: 1, sitesBlocked: 0, claims: 1, claimsNa: 1, claimsAttached: 1, bySource: {} },
  };
  await enregistrer(rapport);
  await enregistrer(rapport);
  const sites = await ingestQuery<{ count: number }>("SELECT count(*)::int AS count FROM leak_site WHERE slug = 'alpha'");
  const claims = await ingestQuery<{ count: number; org_id: number | null; na_motif: string | null }>(
    "SELECT count(*)::int AS count, max(org_id) AS org_id, max(na_motif) AS na_motif FROM leak_claim WHERE fingerprint = $1",
    [enrichie.fingerprint],
  );
  assert.equal(sites.rows[0].count, 1);
  assert.equal(claims.rows[0].count, 1);
  assert.equal(claims.rows[0].org_id, orgId);
  assert.match(claims.rows[0].na_motif ?? "", /commune/);
});
