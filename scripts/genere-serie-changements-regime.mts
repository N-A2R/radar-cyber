#!/usr/bin/env -S npx tsx
/**
 * Generates the versioned regime-change fixture.
 *
 * Six OSINT families over 460 days. Each family carries five sustained level
 * shifts (30 annotations in total), weekly seasonality, overdispersed daily
 * counts and four isolated one-day spikes that must not be mistaken for a
 * regime change. No real event, organisation or personal data is used.
 *
 * The PRNG is fixed, so re-running the script reproduces the committed file
 * byte for byte.
 *
 *   apps/api/node_modules/.bin/tsx scripts/genere-serie-changements-regime.mts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { addDays } from "../apps/api/src/analyse/changepoint.js";
import type { ChangepointFixture } from "../apps/api/src/analyse/changepoint-backtest.js";

const START = "2025-09-01";
const DAYS = 460;
const SEED = 20261122;
const SEASON = [1.0, 1.05, 1.08, 1.06, 1.0, 0.85, 0.8];

const FAMILIES: Record<string, number> = {
	ransomware: 35,
	vuln: 240,
	leaks: 20,
	cert_fr: 60,
	cti: 120,
	press: 90,
};

/** First day of each new regime, as an offset from START, and its multiplier. */
const PLANS: Record<string, Array<[number, number]>> = {
	ransomware: [[80, 2.2], [150, 0.5], [230, 1.7], [310, 0.55], [390, 2.0]],
	vuln: [[75, 1.6], [145, 0.6], [225, 1.45], [305, 0.6], [385, 1.8]],
	leaks: [[90, 2.2], [170, 0.5], [250, 2.0], [330, 0.55], [410, 2.2]],
	cert_fr: [[85, 1.9], [165, 0.5], [245, 1.6], [325, 0.55], [405, 2.1]],
	cti: [[78, 1.7], [158, 0.55], [238, 1.5], [318, 0.6], [398, 1.9]],
	press: [[95, 1.8], [175, 0.5], [255, 1.6], [335, 0.55], [415, 2.0]],
};

const SPIKE_OFFSETS = [120, 280, 360, 430];
const SPIKE_FACTORS = [6, 5, 7, 4];

function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function poisson(random: () => number, lambda: number): number {
	const limit = Math.exp(-lambda);
	let product = 1;
	let count = 0;
	do {
		count++;
		product *= random();
	} while (product > limit);
	return count - 1;
}

/** Gamma(shape, 1) multiplier, shape is an integer here. */
function gammaUnit(random: () => number, shape: number): number {
	let sum = 0;
	for (let i = 0; i < shape; i++) sum -= Math.log(Math.max(random(), 1e-12));
	return sum / shape;
}

function seasonOf(offset: number): number {
	const weekday = new Date(`${addDays(START, offset)}T00:00:00Z`).getUTCDay();
	return weekday === 0 ? SEASON[6]! : SEASON[weekday - 1]!;
}

const random = mulberry32(SEED);
const fixture: ChangepointFixture = {
	model: "weekly-z@1",
	start: START,
	days: DAYS,
	seed: SEED,
	families: {},
	annotations: [],
	spikes: [],
};

for (const [family, base] of Object.entries(FAMILIES)) {
	const changes = new Map(PLANS[family] ?? []);
	let level = base;
	const counts: number[] = [];
	for (let offset = 0; offset < DAYS; offset++) {
		const multiplier = changes.get(offset);
		if (multiplier !== undefined) level *= multiplier;
		counts.push(poisson(random, level * seasonOf(offset) * gammaUnit(random, 10)));
	}
	for (const [offset, factor] of SPIKE_OFFSETS.map((value, index) => [value, SPIKE_FACTORS[index]!] as const)) {
		if (changes.has(offset)) continue;
		counts[offset] = Math.max(counts[offset]!, Math.round(level * seasonOf(offset) * factor));
		fixture.spikes.push({ family, day: addDays(START, offset), factor });
	}
	fixture.families[family] = { base, counts };
	for (const [offset, multiplier] of PLANS[family] ?? []) {
		fixture.annotations.push({
			family,
			day: addDays(START, offset),
			direction: multiplier >= 1 ? "up" : "down",
			multiplier,
			rationale:
				`${family} : palier simulé ×${multiplier} — ` +
				`${multiplier >= 1 ? "montée" : "baisse"} durable du flux, sans victime ni source réelle`,
		});
	}
}

const path = fileURLToPath(new URL("../bench/changepoints/serie-460j.json", import.meta.url));
writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`fixture écrite : ${path}`);
console.log(`familles ${Object.keys(fixture.families).length} · jours ${fixture.days} · annotations ${fixture.annotations.length} · pics isolés ${fixture.spikes.length}`);
