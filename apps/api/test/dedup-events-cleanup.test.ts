/**
 * Rapport et nettoyage des doublons historiques (`scripts/dedup-events.mts`).
 *
 * La migration 045 purge les doublons au moment où elle est jouée, mais ne
 * sait pas en rendre compte. Le script doit retrouver des doublons déjà
 * présents (empreinte NULL, état d'avant migration), en donner le nombre,
 * n'effacer que les copies, et laisser intact un article distinct.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { query, closePools } from "../src/db.js";

const SOURCE = `test-dedup-cleanup-${Date.now()}`;
const SCRIPT = fileURLToPath(new URL("../../../scripts/dedup-events.mts", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));

type Rapport = {
  doublonsTrouves: number;
  doublonsNettoyes: number;
  doublonsConserves: number;
  mode: string;
};

after(async () => {
  await query("DELETE FROM event WHERE source_id=$1", [SOURCE]).catch(() => {});
  await query("DELETE FROM collector_run WHERE source_id=$1", [SOURCE]).catch(() => {});
  await query("DELETE FROM source WHERE id=$1", [SOURCE]).catch(() => {});
  await closePools().catch(() => {});
});

test("le script rapporte les doublons existants et ne supprime que les copies", async () => {
  await query(
    `INSERT INTO source (id, name, family, url, kind)
     VALUES ($1,$2,'ransomware','https://exemple.invalid/dedup','narrative')`,
    [SOURCE, `Source test ${SOURCE}`],
  );
  // Deux variantes du même titre, même jour, même source : l'empreinte n'a
  // jamais été écrite (cas d'une base antérieure à la migration 045).
  await query(
    `INSERT INTO event (dedup_key, family, assertion_type, title, source_id, observed_at, severity, source_url, evidence)
     VALUES ($1,'ransomware','ambient_signal','Rançongiciel : ville touchée',$3,'2026-11-21T10:00:00Z',2,'https://example.invalid/event','{"run_id":"1"}'::jsonb),
            ($2,'ransomware','ambient_signal','RANÇONGICIEL:  VILLE  TOUCHÉE',$3,'2026-11-21T18:00:00Z',2,'https://example.invalid/event','{"run_id":"1"}'::jsonb),
            ($4,'ransomware','ambient_signal','Autre article',$3,'2026-11-21T10:00:00Z',2,'https://example.invalid/event','{"run_id":"1"}'::jsonb)`,
    [`feed:${SOURCE}:1`, `feed:${SOURCE}:2`, SOURCE, `feed:${SOURCE}:3`],
  );

  const avant = await query<{ id: number }>(
    "SELECT id FROM event WHERE source_id=$1 ORDER BY id", [SOURCE],
  );
  assert.equal(avant.rows.length, 3);

  const sortie = execFileSync(TSX, [SCRIPT], { encoding: "utf8" });
  const rapportRapport = JSON.parse(sortie) as Rapport;
  assert.equal(rapportRapport.mode, "rapport");
  assert.equal(rapportRapport.doublonsTrouves, 1, "la copie en trop est comptée");
  assert.equal(rapportRapport.doublonsNettoyes, 0, "le mode rapport n'écrit rien");

  const applique = execFileSync(TSX, [SCRIPT, "--appliquer"], { encoding: "utf8" });
  const rapport = JSON.parse(applique) as Rapport;
  assert.equal(rapport.doublonsTrouves, 1, "un doublon existant trouvé");
  assert.equal(rapport.doublonsNettoyes, 1, "un doublon existant nettoyé");

  const apres = await query<{ id: number; title: string }>(
    "SELECT id, title FROM event WHERE source_id=$1 ORDER BY id", [SOURCE],
  );
  assert.equal(apres.rows.length, 2, "une seule ligne par article subsiste");
  assert.equal(apres.rows[0]!.id, avant.rows[0]!.id, "le plus ancien enregistrement survit");
  assert.equal(apres.rows[1]!.title, "Autre article", "un titre distinct est conservé");
});
