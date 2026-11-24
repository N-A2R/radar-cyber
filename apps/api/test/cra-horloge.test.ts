/**
 * Horloge CRA : une vulnérabilité grave porte ses trois échéances dans sa
 * preuve, sans texte libre ni donnée personnelle.
 *
 * Les cinq cas ci-dessous couvrent 24 h, 72 h, 14 jours, la qualification
 * cpe/exploited et le critère SQL brut du contrôle externe, exécuté tel quel.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { query } from "../src/db.js";
import {
  CRITERE_CRA_VULN,
  compteVulnsSansHorloge,
  echeancesCra,
  horlogeDepuisEvidence,
  renduHorlogeCra,
} from "../src/cra/horloge-cra.js";

const TAG = `cra${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const SOURCE_NVD = `test:${TAG}:nvd`;
const SOURCE_KEV = `test:${TAG}:kev`;
const DATE = "2026-09-11T08:00:00.000Z";
const MIGRATION = new URL("../../../db/migrate-217-cra-horloge-vuln.sql", import.meta.url);

const ids: Record<string, string> = {};

type Preuve = { evidence: Record<string, unknown> };

async function insere(options: {
  cle: string;
  titre: string;
  famille?: string;
  severite: number;
  date: string;
  source: string;
  evidence: Record<string, unknown>;
}): Promise<void> {
  const resultat = await query<{ id: string }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, severity,
                        at, valid_at, observed_at, source_id, source_url, evidence)
     VALUES ($1, $2, 'technical_indicator', $3, $4, $5, $5, $5, $6,
             'https://exemple.invalid/cra', $7::jsonb)
     RETURNING id::text`,
    [
      `test:${TAG}:${options.cle}`,
      options.famille ?? "vuln",
      options.titre,
      options.severite,
      options.date,
      options.source,
      JSON.stringify({ run_id: "1", ...options.evidence }),
    ],
  );
  const id = resultat.rows[0]?.id;
  if (!id) throw new Error(`événement de test non inséré : ${options.cle}`);
  ids[options.cle] = id;
}

async function preuve(cle: string): Promise<Preuve["evidence"]> {
  const resultat = await query<Preuve>("SELECT evidence FROM event WHERE id = $1", [ids[cle]]);
  const evidence = resultat.rows[0]?.evidence;
  if (!evidence) throw new Error(`preuve introuvable : ${cle}`);
  return evidence;
}

before(async () => {
  await query(
    `INSERT INTO source (id, name, family, url, region, enabled)
     VALUES ($1, 'NVD (test CRA)', 'vuln', 'https://exemple.invalid/nvd', 'national', false),
            ($2, 'KEV (test CRA)', 'vuln', 'https://exemple.invalid/kev', 'national', false)`,
    [SOURCE_NVD, SOURCE_KEV],
  );

  await insere({
    cle: "principal",
    titre: "CVE-2026-10001 — défaut dans un produit éditeur",
    severite: 8,
    date: DATE,
    source: SOURCE_NVD,
    evidence: { cvss: 9.8, vendor: "Acme", product: "Widget" },
  });
  await insere({
    cle: "cveSeul",
    titre: "CVE-2026-12345 — composant non renseigné",
    severite: 7,
    date: DATE,
    source: SOURCE_NVD,
    evidence: {},
  });
  await insere({
    cle: "exploite",
    titre: "CVE-2026-20002 — exploitation confirmée",
    severite: 9,
    date: "2026-10-05T12:00:00.000Z",
    source: SOURCE_KEV,
    evidence: { vendor: "Acme", product: "Routeur", known_exploited: true },
  });
  await insere({
    cle: "explicite",
    titre: "CVE-2026-30003 — preuve déclarée par le collecteur",
    severite: 7,
    date: DATE,
    source: SOURCE_NVD,
    evidence: {
      cpe: "cpe:2.3:a:acme:custom:1.0:*:*:*:*:*:*:*",
      exploited: false,
    },
  });
  await insere({
    cle: "basse",
    titre: "CVE-2026-40004 — gravité insuffisante",
    severite: 6,
    date: DATE,
    source: SOURCE_NVD,
    evidence: {},
  });
  await insere({
    cle: "autreFamille",
    titre: "Incident sans rapport avec une vulnérabilité",
    famille: "ransomware",
    severite: 9,
    date: DATE,
    source: SOURCE_KEV,
    evidence: {},
  });
});

after(async () => {
  if (Object.keys(ids).length === 0) return;
  const copies = await query<{ dedup_key: string }>(
    `INSERT INTO archive_event
       (id, dedup_key, family, assertion_type, title, summary, observed_at, collected_at,
        valid_at, at, severity, confidence, source_id, source_url, evidence, geo_type,
        lat, lon, org_id, asset_id, created_at)
     SELECT id, dedup_key, family, assertion_type, title, summary, observed_at, collected_at,
            valid_at, at, severity, confidence, source_id, source_url, evidence, geo_type,
            lat, lon, org_id, asset_id, created_at
       FROM event WHERE id = ANY($1::bigint[])
     ON CONFLICT DO NOTHING RETURNING dedup_key`,
    [Object.values(ids)],
  );
  const clefs = copies.rows.map((ligne) => ligne.dedup_key);
  await query("DELETE FROM event WHERE id = ANY($1::bigint[])", [Object.values(ids)]);
  await query("DELETE FROM archive_event WHERE dedup_key = ANY($1::text[])", [clefs]);
  await query("DELETE FROM event_archive WHERE dedup_key = ANY($1::text[])", [clefs]);
  await query("DELETE FROM source WHERE id IN ($1, $2)", [SOURCE_NVD, SOURCE_KEV]);
});

test("24 h : l'alerte précoce à l'ENISA est datée à l'inscription", async () => {
  const evidence = await preuve("principal");
  assert.equal(evidence.prise_de_connaissance, DATE);
  assert.equal(evidence.deadline_24h, "2026-09-12T08:00:00.000Z");
  assert.equal(horlogeDepuisEvidence(evidence).echeances.deadline_24h.toISOString(), "2026-09-12T08:00:00.000Z");
});

test("72 h : la notification est datée sans ressaisie", async () => {
  const evidence = await preuve("principal");
  assert.equal(evidence.deadline_72h, "2026-09-14T08:00:00.000Z");
  const rendu = renduHorlogeCra(horlogeDepuisEvidence(evidence));
  assert.ok(rendu.some((ligne) => ligne.includes("Notification de la vulnérabilité") && ligne.includes("ENISA + utilisateurs")));
});

test("14 jours : le rapport final reste lisible depuis la preuve", async () => {
  const evidence = await preuve("principal");
  assert.equal(evidence.deadline_14d, "2026-09-25T08:00:00.000Z");
  const attendu = echeancesCra(new Date(DATE));
  assert.equal(horlogeDepuisEvidence(evidence).echeances.deadline_14d.toISOString(), attendu.deadline_14d.toISOString());
});

test("cpe et exploited : déduits ou conservés, jamais inventés ailleurs", async () => {
  const principal = horlogeDepuisEvidence(await preuve("principal"));
  assert.equal(principal.cpe, "cpe:2.3:a:acme:widget:*:*:*:*:*:*:*:*");
  assert.equal(principal.exploited, false);

  const cveSeul = horlogeDepuisEvidence(await preuve("cveSeul"));
  assert.equal(cveSeul.cpe, "cpe:2.3:a:non_renseigne:cve-2026-12345:*:*:*:*:*:*:*:*");

  const exploite = horlogeDepuisEvidence(await preuve("exploite"));
  assert.equal(exploite.exploited, true);
  assert.equal(exploite.echeances.deadline_24h.toISOString(), "2026-10-06T12:00:00.000Z");

  const explicite = horlogeDepuisEvidence(await preuve("explicite"));
  assert.equal(explicite.cpe, "cpe:2.3:a:acme:custom:1.0:*:*:*:*:*:*:*");
  assert.equal(explicite.exploited, false);

  for (const cle of ["basse", "autreFamille"]) {
    const evidence = await preuve(cle);
    assert.equal(evidence.cpe, undefined, `${cle} ne doit pas porter d'horloge CRA`);
    assert.equal(evidence.deadline_24h, undefined);
  }
});

test("critère brut : 0 vulnérabilité grave sans horloge, y compris après backfill", async () => {
  await query("ALTER TABLE event DISABLE TRIGGER cra_horloge_on_event");
  try {
    await query("UPDATE event SET evidence = '{\"run_id\":\"1\"}'::jsonb WHERE id = $1", [ids.principal]);
    const avant = await query<{ count: string }>(CRITERE_CRA_VULN);
    assert.equal(Number(avant.rows[0]?.count), 1);
  } finally {
    await query("ALTER TABLE event ENABLE TRIGGER cra_horloge_on_event");
  }

  await query(await readFile(MIGRATION, "utf8"));
  const resultat = await query<{ count: string }>(CRITERE_CRA_VULN);
  assert.equal(Number(resultat.rows[0]?.count), 0);
  assert.equal(await compteVulnsSansHorloge(), 0);
  assert.equal((await preuve("principal")).deadline_72h, "2026-09-14T08:00:00.000Z");
});
