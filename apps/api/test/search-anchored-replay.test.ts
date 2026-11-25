/** Rejeu automatisé du critère : 100 questions, zéro affirmation sans source. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import { answerAnchored } from "../src/search/anchored-answer.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const TAG = `rejeu${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const SOURCE = `${TAG}-source`;
const QUESTIONS_PER_EVENT = 4;
const EVENT_COUNT = 25;
const TOTAL = EVENT_COUNT * QUESTIONS_PER_EVENT;
let eventIds: number[] = [];
let orgIds: number[] = [];

const TEMPLATES = [
  (org: string) => `Quels événements concernent ${org} (Charente) en 2026 ?`,
  (org: string) => `Quelles preuves sont associées à ${org} en 2026 ?`,
  (org: string) => `Que s'est-il passé pour ${org} dans le département 16 en 2026 ?`,
  (org: string) => `Quels événements sont enregistrés pour ${org} en Charente (2026) ?`,
] as const;

before(async () => {
  await query(
    "INSERT INTO source (id, name, family, url, retain_raw) VALUES ($1, $2, 'cert', 'https://example.invalid', false)",
    [SOURCE, `Source ${TAG}`],
  );
  for (let index = 0; index < EVENT_COUNT; index += 1) {
    const label = `ORG${String(index).padStart(2, "0")}`;
    const org = await query<{ id: number }>(
      `INSERT INTO org (name, slug, kind, sector, city, dept, status)
       VALUES ($1, $2, 'sante', 'sante', 'Angoulême', '16', 'confirme') RETURNING id`,
      [`Organisation ${TAG} ${label}`, `${TAG}-${label}`],
    );
    orgIds.push(Number(org.rows[0].id));
    const event = await query<{ id: number }>(
      `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, source_id, org_id, source_url, evidence)
       VALUES ($1, 'cert', 'confirmed_incident', $2, '2026-05-05T00:00:00Z', $3, $4, $5, '{"run_id":"1","tlp":"CLEAR"}'::jsonb)
       RETURNING id`,
      [`${TAG}-${label}`, `Avis de sécurité ${TAG} ${label}`, SOURCE, orgIds[index], `https://example.invalid/${TAG}/${label}`],
    );
    eventIds.push(Number(event.rows[0].id));
  }
});

after(async () => {
  await supprimerEvenementsArchivees("source_id = $1", [SOURCE]);
  await query("DELETE FROM org WHERE id = ANY($1::bigint[])", [orgIds]);
  await query("DELETE FROM source WHERE id = $1", [SOURCE]);
  await closePools();
});

test("100 questions en français : identifiants existants et affirmations sourcées", async () => {
  const questions = eventIds.flatMap((_, index) => {
    const label = `ORG${String(index).padStart(2, "0")}`;
    const org = `Organisation ${TAG} ${label}`;
    return TEMPLATES.map((template) => template(org));
  });
  assert.equal(questions.length, TOTAL);

  const cited = new Set<number>();
  for (const question of questions) {
    const answer = await answerAnchored(question);
    assert.equal(answer.status, "source-backed", `sans réponse : ${question}`);
    assert.ok(answer.assertions.length > 0, `aucune affirmation : ${question}`);
    for (const assertion of answer.assertions) {
      assert.match(assertion.phrase, /Preuve : \[event:\d+\] — source .+, run de collecte \d+\.$/);
      assert.ok(assertion.phrase.includes(assertion.source.url));
      assert.ok(assertion.source.sourceId.length > 0);
      assert.ok(assertion.source.runId.length > 0);
    }
    for (const id of answer.citedEventIds) cited.add(id);
  }

  const found = await query<{ id: number }>("SELECT id FROM event WHERE id = ANY($1::bigint[])", [[...cited]]);
  const existing = new Set(found.rows.map((row) => Number(row.id)));
  for (const id of cited) {
    assert.equal(existing.has(id), true, `identifiant cité introuvable : ${id}`);
  }
  assert.equal(cited.size >= EVENT_COUNT, true, "les 100 questions doivent couvrir les 25 événements semés");
});
