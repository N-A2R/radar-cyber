/**
 * Usurpation de domaines : variantes, décision, mesure de faux positifs et
 * écriture des preuves. Toute sonde réseau est simulée ; la base de test est
 * celle que `test/run.ts` crée pour la suite.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ingestQuery, query } from "../src/db.js";
import {
  analyserCibles,
  enregistrerResultats,
  rattacherUrl,
  type Cible,
  type Sonde,
} from "../src/detect/phishing-scan.js";
import {
  classerUsurpation,
  genererVariantes,
  mesurerFauxPositifs,
  type TyposquatFinding,
} from "../src/detect/typosquat.js";

const MAINTENANT = new Date("2026-11-21T12:00:00Z");
const CERT_RECENT = {
  issuer: "Let's Encrypt",
  notBefore: "2026-10-01T00:00:00Z",
  notAfter: "2027-01-01T00:00:00Z",
  dnsNames: ["univ-poitier.fr"],
};

const CIBLE: Cible = {
  orgId: 42,
  orgName: "Université de Poitiers",
  domain: "univ-poitiers.fr",
  dept: "86",
};

function finding(sur: Partial<TyposquatFinding> = {}): TyposquatFinding {
  return {
    orgId: 42,
    orgName: "Université de Poitiers",
    dept: "86",
    officialDomains: ["univ-poitiers.fr"],
    base: "univ-poitiers.fr",
    domain: "univ-poitier.fr",
    cert: CERT_RECENT,
    similarity: 0.92,
    a: ["192.0.2.10"],
    aaaa: [],
    cert: CERT_RECENT,
    page: {
      status: 200,
      url: "https://univ-poitier.fr/",
      title: "Université de Poitiers — connexion à votre compte",
      text: "Identifiant Mot de passeSE CONNECTER",
    },
    ...sur,
  };
}

function sondeActive(domainAttendu: string): Sonde & { appels: string[] } {
  const appels: string[] = [];
  return {
    appels,
    async dns(domain) {
      appels.push(`dns:${domain}`);
      return domain === domainAttendu ? { a: ["192.0.2.10"], aaaa: [] } : { a: [], aaaa: [] };
    },
    async certificat() {
      appels.push("cert");
      return CERT_RECENT;
    },
    async page() {
      appels.push("page");
      return { status: 200, url: `https://${domainAttendu}/`, title: "Université de Poitiers connexion", text: "mot de passe" };
    },
    async urlsPhishing() {
      return [];
    },
  };
}

test("les variantes couvrent omission, transposition, tiret et homoglyphe punycode", () => {
  const variantes = genererVariantes(CIBLE.domain, 200);
  const domaines = variantes.map((v) => v.domain);
  assert.ok(domaines.includes("univ-poitier.fr"), "une lettre omise");
  assert.ok(domaines.includes("univ-piotiers.fr"), "deux lettres transposées");
  assert.ok(domaines.includes("univ-poitiers.com") === false, "le TLD n'est pas dans les variantes locales");
  assert.ok(variantes.some((v) => v.kind === "tiret"));
  assert.ok(variantes.some((v) => v.domain.startsWith("xn--")), "homoglyphe encodé en punycode");
});

test("une page officielle ou un domaine de vente n'est pas une usurpation", () => {
  const officiel = classerUsurpation(
    finding({ page: { status: 200, url: "https://www.univ-poitiers.fr/", title: "Université de Poitiers", text: "Accueil" } }),
    MAINTENANT,
  );
  assert.equal(officiel.usurpation, false);
  assert.ok(officiel.motifs.includes("redirection-officielle"));

  const vente = classerUsurpation(
    finding({ page: { status: 200, url: "https://univ-poitier.fr/", title: "Domain name for sale", text: "Acheter ce domaine" } }),
    MAINTENANT,
  );
  assert.equal(vente.usurpation, false);
  assert.ok(vente.motifs.includes("domaine-de-vente-ou-parked"));
});

test("le taux de faux positifs se mesure parmi les alertes brutes", () => {
  const mesure = mesurerFauxPositifs(
    [
      finding({ domain: "a.univ-poitier.fr" }),
      finding({ domain: "b.univ-poitier.fr", cert: { ...CERT_RECENT, notBefore: "2020-01-01T00:00:00Z" } }),
    ],
    20,
    MAINTENANT,
  );
  assert.equal(mesure.echantillon, 2);
  assert.equal(mesure.alarmes, 2, "les deux noms sont proches et résolus");
  assert.equal(mesure.fauxPositifs, 1, "seul le domaine à certificat ancien est rejeté");
  assert.equal(mesure.taux, 0.5);
});

test("le scan ne sonde que les variantes résolues et garde l'organisation", async () => {
  const sonde = sondeActive("univ-poitier.fr");
  const resultat = await analyserCibles([CIBLE], sonde, { maintenant: MAINTENANT, maxVariantes: 200 });
  assert.ok(resultat.variantesTestees > 20);
  assert.equal(resultat.domainesActifs.length, 1);
  assert.equal(resultat.usurpations.length, 1);
  assert.equal(resultat.usurpations[0]?.finding.orgId, 42);
  assert.equal(resultat.sources.dns.requetes, resultat.variantesTestees);
  assert.ok(sonde.appels.filter((a) => a.startsWith("dns:")).length === resultat.variantesTestees);
  assert.equal(sonde.appels.filter((a) => a === "cert").length, 1);
  assert.equal(sonde.appels.filter((a) => a === "page").length, 1);
});

test("une URL de flux n'est rattachée que si son hôte imite le domaine officiel", () => {
  const variants = new Map([["univ-poitier.fr", CIBLE]]);
  const ok = rattacherUrl("https://univ-poitier.fr/connexion", "openphish", [CIBLE], variants);
  assert.equal(ok?.orgId, 42);
  assert.equal(ok?.motif, "variante-generee");
  assert.equal(rattacherUrl("https://banque-example.fr/compte", "openphish", [CIBLE], variants), null);
});

test("les preuves sont écrites une seule fois et rattachées à une organisation", async () => {
  const cible: Cible = { orgId: null, orgName: "Université de Test Typosquat", domain: "univ-test.fr", dept: "86" };
  const resultat = await analyserCibles([cible], sondeActive("univ-tes.fr"), {
    maxVariantes: 200,
  });
  assert.equal(resultat.usurpations.length, 1);

  try {
    await enregistrerResultats(resultat);
    const second = await enregistrerResultats(resultat);
    assert.equal(second.evenements, 0, "la seconde écriture est un no-op");
    const rows = await query<{ id: number; family: string; org_name: string; url: string }>(
      `SELECT e.id, e.family, o.name AS org_name, e.source_url AS url
         FROM event e LEFT JOIN org o ON o.id = e.org_id
        WHERE e.dedup_key LIKE $1`,
      ["typosquat:univ-tes.fr:%"],
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0]?.family, "typosquat");
    assert.equal(rows.rows[0]?.org_name, cible.orgName);
    assert.equal(rows.rows[0]?.url, "https://univ-tes.fr/");
  } finally {
    await ingestQuery("DELETE FROM event WHERE dedup_key LIKE $1", ["typosquat:univ-tes.fr:%"]);
    await ingestQuery("DELETE FROM org WHERE slug = $1", ["universite-de-test-typosquat"]);
    // Le scan a ouvert un run pour la source : il part avant elle.
    await ingestQuery("DELETE FROM collector_run WHERE source_id = $1", ["typosquat-passif"]);
    await ingestQuery("DELETE FROM source WHERE id = $1", ["typosquat-passif"]);
  }
});
