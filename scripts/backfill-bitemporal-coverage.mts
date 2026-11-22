#!/usr/bin/env -S npx tsx
/**
 * Bounded slice of the bitemporal backfill (migration 070 triggers cover all
 * future writes). One invocation inserts at most one id slice, so no command
 * exceeds the 60 s budget even on the 1.67 M-row reference under load.
 *
 *   DATABASE_URL=... tsx scripts/backfill-bitemporal-coverage.mts \
 *     --table=org --after=0 --span=300000
 *
 * Prints `inserted=<n> next=<upper bound>`; loop until inserted=0. Offline,
 * no paid service, no personal data.
 */
import { createRequire } from "node:module";
import { backfillAliasSlice, backfillOrgSlice } from "../apps/api/src/referentiel/bitemporal-backfill.js";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");

const args = process.argv.slice(2);
const value = (name: string, fallback: string): string =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const table = value("table", "org");
const after = Number(value("after", "0"));
const span = Number(value("span", "300000"));
if (!["org", "alias"].includes(table) || !Number.isSafeInteger(after) || after < 0 ||
    !Number.isSafeInteger(span) || span <= 0) {
  console.error("usage: --table=org|alias --after=<id> --span=<positive integer>");
  process.exit(1);
}
const before = after + span;

const url = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5433/radar";
const client = new Client({
	connectionString: url,
	statement_timeout: 55_000,
	application_name: "radar-bitemporal-backfill",
});

try {
	await client.connect();
	const inserted = table === "org"
		? await backfillOrgSlice(client, after, before)
		: await backfillAliasSlice(client, after, before);
	console.log(`table=${table} after=${after} next=${before} inserted=${inserted}`);
} finally {
	await client.end();
}
