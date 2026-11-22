/**
 * Test runner for the insurance score alone.
 *
 * Creates a private schema in the configured database, applies the schema
 * there, runs the two test files against it, then drops the schema. No other
 * agent's database or test database is touched, and no database DDL is needed.
 *
 *   pnpm test:insurance
 */
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import pg from "../apps/api/node_modules/pg/lib/index.js";

const { Client } = pg;
const DB_DIR = "db";
const TESTS = [
  "apps/api/test/insurance-score.test.ts",
  "apps/api/test/insurance-query.test.ts",
];
const schema = `insurance_test_${process.pid}`;
const base = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";
const urlWithSchema = new URL(base);
urlWithSchema.searchParams.set("options", `-csearch_path=${schema},public`);
const testUrl = urlWithSchema.toString();

function runSql(sql: string, connectionString: string): Promise<void> {
  const client = new Client({ connectionString, application_name: "radar-insurance-test" });
  return client.connect().then(async () => {
    try {
      await client.query(sql);
    } finally {
      await client.end();
    }
  });
}

async function prepare(): Promise<void> {
  await runSql(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema}`, base);
  const client = new Client({ connectionString: testUrl, application_name: "radar-insurance-setup" });
  await client.connect();
  try {
    const files = ["init.sql", ...(await readdir(DB_DIR)).filter((f) => /^migrate-.*\.sql$/.test(f)).sort()];
    for (const file of files) {
      await client.query(await readFile(`${DB_DIR}/${file}`, "utf8"));
    }
  } finally {
    await client.end();
  }
}

function runTests(): Promise<number> {
  const child = spawn("apps/api/node_modules/.bin/tsx", ["--test", "--test-concurrency=1", ...TESTS], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  });
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

await prepare();
let code = 1;
try {
  code = await runTests();
} finally {
  await runSql(`DROP SCHEMA IF EXISTS ${schema} CASCADE`, base);
}
process.exit(code);
