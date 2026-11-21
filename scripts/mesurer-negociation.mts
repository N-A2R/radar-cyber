#!/usr/bin/env -S npx tsx
/**
 * Measure the delay between a private ransomware claim (negotiation chat) and
 * the public leak-site post, from two independent public sources.
 *
 *   tsx scripts/mesurer-negociation.mts
 *   tsx scripts/mesurer-negociation.mts --json=bench/results/negociation.json
 *
 * No stolen data, no victim personal data, no payment and no negotiation with
 * a group: only public dates and public victim identifiers are read.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { distribution, matchNegotiations } from "../apps/api/src/analyse/negociation.js";
import { harvest } from "../apps/api/src/collectors/negociation.js";

const argv = process.argv.slice(2);
const option = (name: string): string | undefined => argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const output = option("json") ?? "bench/results/negociation.json";
const years = option("years")?.split(",").map(Number).filter((y) => Number.isInteger(y) && y >= 2022) ?? [];

const { chats, claims } = await harvest(undefined, years);
const delays = matchNegotiations(chats, claims);
const stats = distribution(delays);
const rapport = {
	generatedAt: new Date().toISOString(),
	sources: {
		chats: "https://www.ransomware.live/nego",
		claims: "https://www.ransomlook.io/api/posts/{year}",
	},
	method: "chat start date -> first public leak-site post date, same group and named victim, delay >= 0",
	input: { chats: chats.length, claims: claims.length },
	stats,
	delays: delays.map((d) => ({
		group: d.group,
		victim: d.victim,
		claimStartedAt: d.startedAt,
		leakPublishedAt: d.leakPublishedAt,
		delayDays: d.delayDays,
		paid: d.paid,
	})),
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(rapport, null, 2)}\n`);
console.log(`chats publics : ${chats.length} ; revendications : ${claims.length}`);
console.log(`victimes avec délai mesurable : ${stats.n}`);
console.log(`q1 ${stats.q1} j ; p50 ${stats.p50} j ; q3 ${stats.q3} j ; p90 ${stats.p90} j ; max ${stats.max} j`);
console.log(`paiement confirmé : ${stats.paidConfirmed} ; inconnu : ${stats.paidUnknown}`);
console.log(`rapport : ${output}`);
