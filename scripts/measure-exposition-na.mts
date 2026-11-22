#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Reproducible measurement of Nouvelle-Aquitaine organisations with at least
 * one measured exposed service. Reads the shared inventory only.
 *
 * Usage:
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-exposition-na.mts \
 *       --json=bench/results/exposition-na-2026-11-22.json
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { closePools } from "../apps/api/src/db.js";
import { measureExposition } from "../apps/api/src/exposition/web-service.js";

const jsonArg = process.argv.slice(2).find((arg) => arg.startsWith("--json="));
const output = jsonArg?.slice(7) ?? "bench/results/exposition-na-2026-11-22.json";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		const measurement = await measureExposition();
		await mkdir(dirname(output), { recursive: true });
		await writeFile(output, `${JSON.stringify(measurement, null, 2)}\n`);
		console.log(
			`NA exposed services: ${measurement.organisationsWithService} organisations / ` +
				`${measurement.organisationsInScope} in scope, ${measurement.services} services ` +
				`(by source: ${JSON.stringify(measurement.bySource)}) -> ${output}`,
		);
	} finally {
		await closePools();
	}
}
