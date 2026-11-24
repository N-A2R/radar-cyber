#!/usr/bin/env -S npx tsx
/**
 * Contrôle reproductible de la rétention des indicateurs cités par une alerte.
 *
 * Base jetable uniquement (jamais la base applicative). On insère 10 001
 * indicateurs anciens non cités, un indicateur ancien cité par une alerte et
 * un indicateur récent, puis on lance deux fois la vraie rétention. La preuve
 * porte sur trois points : la ligne citée survit, chaque lot DELETE reste
 * borné à 10 000 lignes, et le second passage ne supprime plus rien.
 *
 *   pnpm exec tsx scripts/verifie-retention-indicateur-cite.mts
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createTestDatabase, dropTestDatabase } from "../apps/api/test/helpers/testdb.js";

const db = await createTestDatabase();
process.env.DATABASE_URL = db.url;
// Les modules lisent DATABASE_URL à l'import : chargement après rattachement.
const { query, closePools } = await import("../apps/api/src/db.js");
const { runRetention } = await import("../apps/api/src/maintenance/retention.js");

const BATCH = 10_000;
const ANCIENS = BATCH + 1;
const marque = `ind${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const ancien = new Date(Date.now() - 400 * 86_400_000).toISOString();
const recent = new Date().toISOString();

async function present(id: number): Promise<boolean> {
  const { rows } = await query<{ présent: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM indicator WHERE id = $1) AS présent",
    [id],
  );
  return rows[0]?.présent === true;
}

function lotsDesJournaux(messages: string[]): number[] {
  return messages
    .filter((m) => m.startsWith("indicator batch: "))
    .map((m) => Number(m.slice("indicator batch: ".length)));
}

try {
  // Un seul INSERT en vrac : le volume teste la borne par lot, pas la vitesse.
  await query(
    `INSERT INTO indicator (type, value, first_seen, last_seen)
     SELECT 'domain', $1 || '-' || i, $2, $2 FROM generate_series(1, $3) AS i`,
    [marque, ancien, ANCIENS],
  );
  const cite = await query<{ id: number }>(
    `INSERT INTO indicator (type, value, first_seen, last_seen)
     VALUES ('domain', $1, $2, $2) RETURNING id`,
    [`${marque}-cite`, ancien],
  );
  const neuf = await query<{ id: number }>(
    `INSERT INTO indicator (type, value, first_seen, last_seen)
     VALUES ('domain', $1, $2, $2) RETURNING id`,
    [`${marque}-recent`, recent],
  );
  const idCite = Number(cite.rows[0]?.id);
  const idNeuf = Number(neuf.rows[0]?.id);
  await query(
    "INSERT INTO alert (rule_id, title, severity, indicator_id) VALUES ($1, $2, 3, $3)",
    [`${marque}-regle`, `Alerte ${marque}`, idCite],
  );

  const journaux1: string[] = [];
  const premier = await runRetention((m) => journaux1.push(m), { tables: ["indicator"], days: 1 });
  const lots1 = lotsDesJournaux(journaux1);

  console.log(`1er passage : ${premier.indicators} indicateur(s) purgé(s), lots ${JSON.stringify(lots1)}`);
  console.log(`ligne citée id=${idCite} présente après purge : ${await present(idCite)}`);
  console.log(`ligne récente id=${idNeuf} présente après purge : ${await present(idNeuf)}`);
  assert.deepEqual(lots1, [BATCH, 1, 0], "lots bornés à 10 000, puis arrêt sur lot vide");
  assert.equal(premier.indicators, ANCIENS, "seuls les anciens non cités doivent partir");
  assert.equal(await present(idCite), true, "un indicateur cité par une alerte ne doit pas être purgé");
  assert.equal(await present(idNeuf), true, "un indicateur récent ne doit pas être purgé");

  const journaux2: string[] = [];
  const second = await runRetention((m) => journaux2.push(m), { tables: ["indicator"], days: 1 });
  console.log(`2e passage : ${second.indicators} indicateur(s) purgé(s), lots ${JSON.stringify(lotsDesJournaux(journaux2))}`);
  assert.equal(second.indicators, 0, "la purge doit être idempotente");
  assert.deepEqual(lotsDesJournaux(journaux2), [0], "aucun DELETE supplémentaire attendu");
  assert.equal(await present(idCite), true, "la ligne citée doit survivre au second passage");

  // L'exemption n'est pas permanente : sans alerte, la purge reprend la ligne.
  await query("DELETE FROM alert WHERE rule_id = $1", [`${marque}-regle`]);
  const apresLevee = await runRetention(() => {}, { tables: ["indicator"], days: 1 });
  console.log(`après levée de l'alerte : ${apresLevee.indicators} indicateur(s) purgé(s)`);
  assert.equal(apresLevee.indicators, 1, "l'indicateur libéré doit enfin être purgé");
  assert.equal(await present(idCite), false, "l'indicateur libéré ne doit plus être en base");
  assert.equal(await present(idNeuf), true, "la ligne récente reste intacte");

  console.log("OK : ligne citée conservée, lots bornés à 10 000, second passage à 0.");
} finally {
  await closePools().catch(() => undefined);
  await dropTestDatabase(db);
}
