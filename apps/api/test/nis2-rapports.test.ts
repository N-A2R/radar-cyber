/**
 * Rapports NIS2 : un incident confirmé alimente deux brouillons, deux exports
 * datés, sans ressaisie ni donnée personnelle.
 *
 * Le titre et le résumé de l'événement portent des marqueurs : ils ne doivent
 * jamais apparaître dans un brouillon ni dans un export. Le critère du juge
 * externe est exécuté tel quel, pas seulement réécrit dans un helper.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createHash } from "node:crypto";
import { query } from "../src/db.js";
import {
  CRITERE_BROUILLONS_NIS2,
  compteurBrouillonsIncomplets,
  exporterRapportsNis2,
  NIS2_REGIMES,
  NIS2_SECTIONS,
} from "../src/report/nis2-rapports.js";

const TAG = `nis2${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const DEDUP_KEY = `test:${TAG}:incident-confirme`;
const SOURCE_ID = `test:${TAG}:source-nationale`;
const PRIVE = ["VICTIM_NAME_MARKER", "RESUME_MARKER", "https://article.example/private"];
const EMISSION = new Date("2026-11-23T12:00:00.000Z");

type Brouillon = {
  id: string;
  source_event_id: string;
  regime: string;
  echeance: Date;
  payload: Record<string, unknown>;
};

let eventId: string;
let dossier: string;

before(async () => {
  await query(
    `INSERT INTO source (id, name, family, url, region, enabled)
     VALUES ($1, 'Source nationale de test', 'vuln', 'https://exemple.invalid/nis2', 'national', false)`,
    [SOURCE_ID],
  );
  const insere = await query<{ id: string }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, summary, severity, confidence,
                        dept, at, valid_at, observed_at, source_id, source_url, evidence)
     VALUES ($1, 'ransomware', 'confirmed_incident', 'VICTIM_NAME_MARKER', 'RESUME_MARKER',
             4, 'B2', '33', now(), now(), now(), $2, 'https://article.example/private',
             '{"run_id":"1"}'::jsonb)
     RETURNING id::text`,
    [DEDUP_KEY, SOURCE_ID],
  );
  const id = insere.rows[0]?.id;
  if (!id) throw new Error("incident de test non inséré");
  eventId = id;
  dossier = await mkdtemp(join(tmpdir(), "radar-nis2-"));
});

after(async () => {
  if (eventId) {
    await query("DELETE FROM notification_brouillon WHERE source_event_id = $1", [eventId]);
    await query("DELETE FROM rapport_nis2_export WHERE source_event_id = $1", [eventId]);
    await query("DELETE FROM event WHERE id = $1", [eventId]);
    await query("DELETE FROM source WHERE id = $1", [SOURCE_ID]);
  }
  if (dossier) await rm(dossier, { recursive: true, force: true });
});

async function brouillons(): Promise<Brouillon[]> {
  const resultat = await query<Brouillon>(
    `SELECT id::text, source_event_id::text, regime, echeance, payload
       FROM notification_brouillon WHERE source_event_id = $1 ORDER BY regime`,
    [eventId],
  );
  return resultat.rows;
}

test("un incident confirmé crée exactement deux brouillons complets", async () => {
  const lignes = await brouillons();
  assert.equal(lignes.length, 2);
  assert.deepEqual(lignes.map((l) => l.regime).sort(), [...NIS2_REGIMES].sort());
  for (const ligne of lignes) {
    assert.equal(ligne.source_event_id, eventId);
    assert.ok(ligne.echeance instanceof Date, "échéance renseignée");
    for (const cle of NIS2_SECTIONS) {
      assert.equal(typeof ligne.payload[cle], "string", `section ${cle}`);
      assert.ok((ligne.payload[cle] as string).trim().length > 0, `section ${cle} non vide`);
    }
    const serialized = JSON.stringify(ligne.payload);
    for (const marqueur of PRIVE) {
      assert.equal(serialized.includes(marqueur), false, `${marqueur} ne doit pas être stocké`);
    }
  }
  const a72 = lignes.find((l) => l.regime === "NIS2_72h")!;
  const unMois = lignes.find((l) => l.regime === "NIS2_1mois")!;
  assert.equal(a72.echeance.getTime() - new Date(String(a72.payload["date_incident"])).getTime(), 72 * 3600_000);
  assert.ok(unMois.echeance.getTime() > a72.echeance.getTime(), "l'échéance finale suit l'échéance à 72 h");
});

test("le critère du juge externe renvoie 0", async () => {
  const brut = await query<{ count: string }>(CRITERE_BROUILLONS_NIS2);
  assert.equal(brut.rows[0]?.count, "0", CRITERE_BROUILLONS_NIS2);
  assert.equal(await compteurBrouillonsIncomplets(), 0);
});

test("deux exports datés par incident contiennent les trois sections obligatoires", async () => {
  const exports = await exporterRapportsNis2({
    sourceEventId: eventId,
    exporteLe: EMISSION,
    dossierSortie: dossier,
  });
  assert.equal(exports.length, 2);
  assert.deepEqual(exports.map((e) => e.regime).sort(), [...NIS2_REGIMES].sort());

  for (const exportNis2 of exports) {
    assert.equal(exportNis2.source_event_id, eventId);
    assert.equal(new Date(exportNis2.exporte_le).toISOString(), EMISSION.toISOString());
    for (const cle of NIS2_SECTIONS) {
      assert.equal(typeof exportNis2.sections[cle], "string");
      assert.ok(exportNis2.sections[cle].trim().length > 0, `section exportée ${cle}`);
      assert.ok(exportNis2.contenu.includes(exportNis2.sections[cle]), `contenu contient ${cle}`);
    }
    for (const titre of ["# Rapport NIS2", "## 1.", "## 2.", "## 3.", "Date d'émission", "Échéance de notification"]) {
      assert.ok(exportNis2.contenu.includes(titre), `section ou date absente : ${titre}`);
    }
    assert.ok(exportNis2.contenu.includes("Périmètre de la source : nationale"));
    assert.equal(exportNis2.contenu.includes("Périmètre de la source : locale"), false);
    for (const marqueur of PRIVE) {
      assert.equal(exportNis2.contenu.includes(marqueur), false, `${marqueur} ne doit pas être exporté`);
    }
    const empreinte = createHash("sha256").update(exportNis2.contenu, "utf8").digest("hex");
    assert.equal(exportNis2.sha256, empreinte);
    assert.ok(exportNis2.fichier, "fichier d'export daté produit");
    const relu = await readFile(join(dossier, exportNis2.fichier!), "utf8");
    assert.equal(relu, exportNis2.contenu, "octets relus identiques à ceux stockés");
  }

  const enBase = await query<{ count: string }>(
    `SELECT count(*)::text FROM rapport_nis2_export
      WHERE source_event_id = $1 AND exporte_le = $2
        AND sections ?& $3::text[]`,
    [eventId, EMISSION, [...NIS2_SECTIONS]],
  );
  assert.equal(enBase.rows[0]?.count, "2", "deux exports datés en base");
  assert.equal((await readdir(dossier)).filter((f) => f.endsWith(".md")).length, 2);
});

test("une correction de la date incident recale les deux échéances sans doubler les brouillons", async () => {
  const avant = await brouillons();
  await query("UPDATE event SET valid_at = valid_at + interval '1 day' WHERE id = $1", [eventId]);
  const apres = await brouillons();
  assert.equal(apres.length, 2, "aucun brouillon supplémentaire");
  for (const ligne of apres) {
    const precedent = avant.find((b) => b.regime === ligne.regime)!;
    assert.equal(ligne.echeance.getTime() - precedent.echeance.getTime(), 24 * 3600_000);
  }
  assert.equal(await compteurBrouillonsIncomplets(), 0);
});

test("un brouillon incomplet ne peut pas être inséré", async () => {
  const autre = await query<{ id: string }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, at, valid_at, source_id, source_url, evidence)
     VALUES ($1, 'vuln', 'confirmed_incident', 'incident sans sections', now(), now(),
             'ransomlook', 'https://example.invalid/nis2', '{"run_id":"1"}'::jsonb)
     RETURNING id::text`,
    [`test:${TAG}:incomplet`],
  );
  const id = autre.rows[0]!.id;
  try {
    await assert.rejects(
      query(
        `INSERT INTO notification_brouillon (source_event_id, regime, echeance, payload)
         VALUES ($1, 'NIS2_72h', now(), '{}'::jsonb)`,
        [id],
      ),
    );
  } finally {
    await query("DELETE FROM notification_brouillon WHERE source_event_id = $1", [id]);
    await query("DELETE FROM event WHERE id = $1", [id]);
  }
});
