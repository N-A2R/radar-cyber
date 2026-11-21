import { test } from "node:test";
import assert from "node:assert/strict";
import {
	distribution,
	groupKey,
	matchNegotiations,
	quantile,
	type NegotiationChat,
} from "../src/analyse/negociation.js";
import { parseNegotiationCards } from "../src/collectors/negociation.js";

const chat = (victim: string, startedAt: string, paid: boolean | null = null): NegotiationChat => ({
	group: "LockBit3.0",
	victim,
	startedAt,
	paid,
});

test("quantile interpolates between ranks on an even sample", () => {
	assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
	assert.equal(quantile([1, 2, 3, 4], 0.25), 1.75);
	assert.equal(quantile([1, 2, 3, 4], 0.9), 3.7);
});

test("quantile returns null for an empty sample or invalid rank", () => {
	assert.equal(quantile([], 0.5), null);
	assert.equal(quantile([1, 2], 1.5), null);
});

test("group aliases collapse to one matcher key", () => {
	assert.equal(groupKey("LockBit3.0"), "lockbit");
	assert.equal(groupKey("lockbit3"), "lockbit");
	assert.equal(groupKey("lockbit5"), "lockbit");
});

test("only named victims are matched, with the first post after the chat", () => {
	const delays = matchNegotiations(
		[
			chat("guardiananalytics_com", "2023-01-23"),
			chat("20230404", "2023-04-04"),
			chat("lapostemobile_fr", "2022-07-06"),
		],
		[
			{ group: "lockbit3", victim: "guardiananalytics.com", publishedAt: "2023-02-03T02:20:34Z" },
			{ group: "lockbit3", victim: "guardiananalytics.com", publishedAt: "2023-02-20T00:00:00Z" },
			{ group: "lockbit3", victim: "lapostemobile.fr", publishedAt: "2022-08-18T16:25:42Z" },
			{ group: "lockbit3", victim: "lapostemobile.fr", publishedAt: "2022-07-24T11:23:16Z" },
		],
	);
	assert.deepEqual(
		delays.map((d) => [d.victim, d.delayDays]),
		[
			["guardiananalytics_com", 11],
			["lapostemobile_fr", 18],
		],
	);
});

test("a claim before the chat is not counted as a leak delay", () => {
	const delays = matchNegotiations(
		[chat("wcinet_com", "2023-02-17")],
		[{ group: "lockbit3", victim: "wcinet.com", publishedAt: "2023-02-06T14:21:23Z" }],
	);
	assert.equal(delays.length, 0);
});

test("unconfirmed payment stays unknown instead of becoming 'did not pay'", () => {
	const stats = distribution(
		matchNegotiations(
			[chat("a-company-com", "2023-01-01"), chat("b-company-com", "2023-01-01", true)],
			[
				{ group: "lockbit3", victim: "a-company.com", publishedAt: "2023-01-11T00:00:00Z" },
				{ group: "lockbit3", victim: "b-company.com", publishedAt: "2023-01-21T00:00:00Z" },
			],
		),
	);
	assert.equal(stats.n, 2);
	assert.equal(stats.paidConfirmed, 1);
	assert.equal(stats.paidUnknown, 1);
	assert.equal(stats.p50, 15);
});

test("the card parser reads the visible date and the explicit paid marker", () => {
	const html = [
		'<div class="nego-card">',
		'<div class="nego-card-title"><a href="/nego/lockbit3.0/guardiananalytics_com">',
		"guardiananalytics_com</a><span><i title=\"Ransom paid\"></i></span></div>",
		'<div class="nego-stats"><span class="stat"><i class="fa-regular fa-calendar"></i>',
		"2023-01-23</span></div></div>",
		'<div class="nego-card"><a href="/nego/akira/20230529">20230529</a>',
		'<i class="fa-regular fa-calendar"></i> 2023-05-29</div>',
	].join("");
	assert.deepEqual(parseNegotiationCards(html), [
		{ group: "lockbit3.0", victim: "guardiananalytics_com", startedAt: "2023-01-23", paid: true },
		{ group: "akira", victim: "20230529", startedAt: "2023-05-29", paid: null },
	]);
});
