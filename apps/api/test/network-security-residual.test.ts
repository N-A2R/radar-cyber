/** Régressions réseau : validation, redirections, bornes et épinglage DNS. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import {
	assertPublicDomain,
	decompressBounded,
	fetchBounded,
	MAX_TSA_RESPONSE_BYTES,
	NetworkLimitError,
	pinnedDnsLookup,
	readBoundedBody,
	UnsafeUrlError,
} from "../src/security/network.js";
import { extraireJeton } from "../src/journal/rfc3161.js";

function stubFetch(impl: (url: string) => Response): typeof fetch {
	return (async (input: string | URL) => impl(String(input))) as typeof fetch;
}

function sequence(contenu: Buffer): Buffer {
	if (contenu.length < 0x80) return Buffer.concat([Buffer.from([0x30, contenu.length]), contenu]);
	const taille = contenu.length;
	return Buffer.concat([
		Buffer.from([0x30, 0x82, (taille >>> 8) & 0xff, taille & 0xff]),
		contenu,
	]);
}

test("URL : schéma, identifiants et IP privées refusés avant tout fetch", async () => {
	const invalides = [
		"file:///etc/passwd",
		"https://user:secret@public.test/",
		"http://127.0.0.1/admin",
		"http://2130706433/admin",
		"http://169.254.169.254/latest/meta-data/",
		"http://[::1]/admin",
	];
	for (const url of invalides) {
		let calls = 0;

		await assert.rejects(
			fetchBounded(url, { fetchImpl: stubFetch(() => { calls++; return new Response("ok"); }) }),
			UnsafeUrlError,
			url,
		);
		assert.equal(calls, 0, `${url} ne doit pas être fetchée`);
	}
});

test("6to4 : l'IPv4 embarquée est lue dans les mots 1 et 2", async () => {
	let calls = 0;
	const fetchImpl = stubFetch(() => {
		calls++;
		return new Response("ok");
	});
	await assert.rejects(
		fetchBounded("http://[2002:7f00:1::1.1.1.1]/admin", { fetchImpl }),
		UnsafeUrlError,
	);
	assert.equal(calls, 0, "aucun fetch vers une 6to4 embarquant une IP privée");
	const result = await fetchBounded("http://[2002:5db8:d822::]/public", { fetchImpl });
	assert.equal(result.status, 200);
	assert.equal(calls, 1, "la 6to4 embarquant une IP publique doit être fetchée");
});

test("redirections : une cible privée est refusée au saut suivant", async () => {
	let calls = 0;
	const fetchImpl = stubFetch((url) => {
		calls++;
		if (url === "https://public.test/start") {
			return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } });
		}
		return new Response("secret");
	});
	await assert.rejects(fetchBounded("https://public.test/start", { fetchImpl }), UnsafeUrlError);
	assert.equal(calls, 1, "aucun fetch vers la cible privée");
});

test("redirections : plafond de cinq sauts", async () => {
	let calls = 0;
	const fetchImpl = stubFetch(() => {
		calls++;
		return new Response(null, { status: 302, headers: { location: `https://public.test/${calls}` } });
	});
	await assert.rejects(fetchBounded("https://public.test/0", { fetchImpl }), /trop de redirections/);
	assert.equal(calls, 6);
});

test("corps et décompression : limites dures", async () => {
	const fetchImpl = stubFetch(() => new Response(null, {
		status: 200,
		headers: { "content-length": String(MAX_TSA_RESPONSE_BYTES + 1) },
	}));
	await assert.rejects(
		fetchBounded("https://public.test/gros", { fetchImpl, maxBytes: MAX_TSA_RESPONSE_BYTES }),
		NetworkLimitError,
	);
	assert.throws(
		() => decompressBounded(gzipSync(Buffer.alloc(64 * 1024, "A")), "gzip", 1024),
		NetworkLimitError,
	);
});

test("enrichissement : domaine RFC 1123 strict", () => {
	for (const invalide of ["127.0.0.1", "x..y.fr", "example.com/path", "*.example.com", "sous_domaine.fr"]) {
		assert.throws(() => assertPublicDomain(invalide), UnsafeUrlError, invalide);
	}
	assert.equal(assertPublicDomain("WWW.Exemple.FR."), "www.exemple.fr");
});

test("TSA : réponse et DER bornés", async () => {
	const reponse = new Response(null, {
		status: 200,
		headers: { "content-length": String(MAX_TSA_RESPONSE_BYTES + 1) },
	});
	await assert.rejects(readBoundedBody(reponse, MAX_TSA_RESPONSE_BYTES), NetworkLimitError);
	let profond: Buffer = Buffer.from([0x05, 0x00]);
	for (let i = 0; i < 40; i++) profond = sequence(profond);
	assert.throws(() => extraireJeton(profond), /DER trop profond/);
	const enfants = Buffer.concat(Array.from({ length: 10_001 }, () => Buffer.from([0x05, 0x00])));
	assert.throws(() => extraireJeton(sequence(enfants)), /trop de nœuds/);
});

test("pinning : le lookup undici ne reçoit que les adresses validées", () => {
	const validees = ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"];
	let recues: Array<{ address: string; ttl: number; family: number }> | null = null;
	pinnedDnsLookup(validees)(new URL("https://public.test/"), {}, (_err, adresses) => {
		recues = adresses;
	});
	assert.deepEqual(recues, [
		{ address: "93.184.216.34", ttl: 60, family: 4 },
		{ address: "2606:2800:220:1:248:1893:25c8:1946", ttl: 60, family: 6 },
	]);
});
test("pinning production : le dispatcher undici sert une adresse épinglée", async () => {
	const server = createServer((_req, res) => {
		res.writeHead(200, { "content-type": "text/plain" });
		res.end("pinned-ok");
	});
	const { promise: listening, resolve: onListening } = Promise.withResolvers<void>();
	server.listen(0, "127.0.0.1", onListening);
	await listening;
	try {
		const addr = server.address();
		assert.ok(addr && typeof addr === "object", "adresse locale");
		const result = await fetchBounded(`http://127.0.0.1:${addr.port}/ping`, {
			allowPrivate: true,
			timeoutMs: 3000,
		});
		assert.equal(result.status, 200);
		assert.equal(result.buffer.toString("utf8"), "pinned-ok");
	} finally {
		const { promise: closed, resolve: onClose } = Promise.withResolvers<void>();
		server.close(() => onClose());
		await closed;
	}
});
