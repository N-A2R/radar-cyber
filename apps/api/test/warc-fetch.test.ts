/**
 * Behavior: a redirect that sets a session cookie is followed with that
 * cookie, as SudOuest's anti-bot gate requires, instead of looping on the
 * same URL until the redirect limit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { fetchFollowingCookies } from "../src/warc/service.js";

test("a cookie-setting redirect is replayed with the session cookie", async () => {
	let sawCookie = false;
	const server = createServer((req, res) => {
		if (!req.headers.cookie?.includes("incap_ses=open")) {
			res.writeHead(302, {
				location: "/gate",
				"set-cookie": "incap_ses=open; Path=/; HttpOnly",
			});
			res.end();
			return;
		}
		sawCookie = true;
		res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
		res.end("<h1>article body</h1>");
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	try {
		const address = server.address();
		assert.ok(address && typeof address === "object");
		const response = await fetchFollowingCookies(
			`http://127.0.0.1:${address.port}/gate`,
			AbortSignal.timeout(5_000),
		);
		assert.equal(response.status, 200);
		assert.match(await response.text(), /article body/);
		assert.equal(sawCookie, true, "the second request must carry the cookie");
	} finally {
		server.close();
		await once(server, "close");
	}
});
