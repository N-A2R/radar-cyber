/**
 * Minimal HTTP decoy. One port, no database writes, no request body reading.
 * Only reserved Nouvelle-Aquitaine hosts on known probe paths are recorded;
 * every other request gets a plain 404 and leaves no trace.
 */
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type RequestListener, type Server } from "node:http";
import { honeypotStore, networkClassifier } from "./instance.js";
import {
	classifyAgent,
	decoyHost,
	fingerprintAddress,
	firstForwardedFor,
	probeFor,
	type NetworkClassifier,
	type ScanStore,
} from "./model.js";

const DEFAULT_SECRET = "radar-na-decoy-v1";

export interface HoneypotOptions {
	host?: string;
	port?: number;
	now?: () => Date;
	secret?: string;
	networkClassifier?: NetworkClassifier;
	store?: ScanStore;
	log?: (message: string) => void;
}

export function createHoneypotHandler(options: HoneypotOptions = {}): RequestListener {
	const store = options.store ?? honeypotStore;
	const classifier = options.networkClassifier ?? networkClassifier;
	const secret = options.secret ?? process.env.RADAR_HONEYPOT_SECRET ?? DEFAULT_SECRET;
	const now = options.now ?? (() => new Date());

	return (req: IncomingMessage, res) => {
		// Draining the body keeps keep-alive sockets healthy without ever
		// inspecting credentials a scanner might post to a fake login page.
		req.resume();
		const host = decoyHost(req.headers.host);
		const probe = probeFor(req.url);
		if (host === null || probe === null) {
			res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
			return;
		}

		const forwarded = firstForwardedFor(req.headers["x-forwarded-for"]);
		const address = forwarded ?? req.socket.remoteAddress ?? "0.0.0.0";
		store.add({
			id: randomUUID(),
			receivedAt: now().toISOString(),
			host,
			probe,
			method: req.method ?? "GET",
			fingerprint: fingerprintAddress(address, secret),
			provenance: {
				agent: classifyAgent(req.headers["user-agent"]),
				network: classifier(address),
				path: forwarded === null ? "direct" : "forwarded",
			},
		});
		res.writeHead(200, {
			"content-type": "text/html; charset=utf-8",
			"cache-control": "no-store",
		}).end("<!doctype html><title>ok</title><body>ok</body>");
	};
}

export async function startHoneypot(options: HoneypotOptions = {}): Promise<Server> {
	const host = options.host ?? process.env.RADAR_HONEYPOT_HOST ?? "0.0.0.0";
	const port = options.port ?? Number(process.env.RADAR_HONEYPOT_PORT ?? 8081);
	const server = createServer(createHoneypotHandler(options));
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	server.once("error", reject);
	server.listen(port, host, () => {
		server.off("error", reject);
		resolve();
	});
	await promise;
	return server;
}

/** Opt-in from the API process: `RADAR_HONEYPOT=1`, no effect otherwise. */
export function maybeStartHoneypot(log?: (message: string) => void): void {
	if (process.env.RADAR_HONEYPOT !== "1") return;
	void startHoneypot({ log }).then((server) => {
		const address = server.address();
		const port = address !== null && typeof address !== "string" ? address.port : 0;
		log?.(`honeypot: Nouvelle-Aquitaine decoy listening on port ${port}`);
	}).catch((error: unknown) => {
		log?.(`honeypot: could not start (${error instanceof Error ? error.message : String(error)})`);
	});
}
