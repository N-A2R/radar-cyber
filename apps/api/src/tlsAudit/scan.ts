/**
 * Live TLS probe and bounded scanner.
 *
 * The probe accepts any certificate (`rejectUnauthorized: false`) so an expired,
 * weak or mismatched certificate is observed instead of being reduced to a
 * handshake error. The scanner bounds concurrency and the total wall clock so a
 * measurement of 1 000 sites stays inside a one-minute budget.
 */
import { X509Certificate } from "node:crypto";
import { isIP } from "node:net";
import { connect, type PeerCertificate, type TLSSocket } from "node:tls";
import { isTransientError, type CertificateObservation, type SiteTarget } from "./index.js";

export interface ProbeOptions {
	timeoutMs?: number;
	now?: () => Date;
}

export interface ScanOptions extends ProbeOptions {
	concurrency?: number;
	budgetMs?: number;
	retries?: number;
	probe?: (target: SiteTarget) => Promise<CertificateObservation>;
}

const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_CONCURRENCY = 64;
const DEFAULT_BUDGET_MS = 55_000;
const DEFAULT_RETRIES = 1;
const RETRY_DELAY_MS = 100;

function errorCode(error: unknown): string {
	if (typeof error !== "object" || error === null) return "UNKNOWN_ERROR";
	if ("code" in error && typeof error.code === "string" && error.code.length > 0) return error.code;
	if ("name" in error && typeof error.name === "string" && error.name.length > 0) return error.name;
	return "UNKNOWN_ERROR";
}

function isoDate(value: string): string | undefined {
	const time = Date.parse(value);
	return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function failure(host: string, port: number, scannedAt: string, error: string): CertificateObservation {
	return { host, port, scannedAt, ok: false, error };
}

/** One TLS handshake, keeping the leaf certificate even when it is invalid. */
export function probeTls(
	host: string,
	port = 443,
	options: ProbeOptions = {},
): Promise<CertificateObservation> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const scannedAt = (options.now ?? (() => new Date()))().toISOString();
	const { promise, resolve } = Promise.withResolvers<CertificateObservation>();
	let settled = false;
	let socket: TLSSocket | null = null;
	let hardTimer: NodeJS.Timeout | undefined;
	const finish = (observation: CertificateObservation): void => {
		if (settled) return;
		settled = true;
		clearTimeout(hardTimer);
		socket?.destroy();
		resolve(observation);
	};
	hardTimer = setTimeout(() => finish(failure(host, port, scannedAt, "ETIMEDOUT")), timeoutMs + 500);
	try {
		socket = connect(
			{
				host,
				port,
				servername: isIP(host) === 0 ? host : undefined,
				rejectUnauthorized: false,
				timeout: timeoutMs,
				ALPNProtocols: ["http/1.1"],
			},
			() => {
				try {
					const peer = socket?.getPeerCertificate(true) as (PeerCertificate & { raw?: Buffer }) | undefined;
					if (!peer?.raw) {
						finish(failure(host, port, scannedAt, "NO_PEER_CERTIFICATE"));
						return;
					}
					const certificate = new X509Certificate(peer.raw);
					const details = certificate.publicKey.asymmetricKeyDetails ?? {};
					const authorizationError = socket?.authorizationError
						? String(socket.authorizationError)
						: null;
					const incomplete = /UNABLE_TO_GET_ISSUER_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE/.test(
						authorizationError ?? "",
					);
					finish({
						host,
						port,
						scannedAt,
						ok: true,
						protocol: socket?.getProtocol() ?? undefined,
						validFrom: isoDate(certificate.validFrom),
						validTo: isoDate(certificate.validTo),
						signatureAlgorithm: certificate.signatureAlgorithm,
						keyType: certificate.publicKey.asymmetricKeyType,
						keyBits: typeof details.modulusLength === "number" ? details.modulusLength : undefined,
						namedCurve: details.namedCurve,
						subject: certificate.subject,
						issuer: certificate.issuer,
						subjectAltName: certificate.subjectAltName,
						authorizationError,
						selfSigned: certificate.subject === certificate.issuer,
						chainComplete: !incomplete,
					});
				} catch (error) {
					finish(failure(host, port, scannedAt, errorCode(error)));
				}
			},
		);
		socket.on("error", (error) => finish(failure(host, port, scannedAt, errorCode(error))));
		socket.on("timeout", () => finish(failure(host, port, scannedAt, "ETIMEDOUT")));
	} catch (error) {
		finish(failure(host, port, scannedAt, errorCode(error)));
	}
	return promise;
}

/** Probes every target with bounded concurrency, a hard deadline and one retry. */
export async function scanTargets(
	targets: SiteTarget[],
	options: ScanOptions = {},
): Promise<CertificateObservation[]> {
	const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
	const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
	const retries = Math.max(0, options.retries ?? DEFAULT_RETRIES);
	const now = options.now ?? (() => new Date());
	const probe = options.probe ?? ((target: SiteTarget) => probeTls(target.host, target.port, options));
	const deadline = Date.now() + budgetMs;
	const results = new Array<CertificateObservation>(targets.length);
	let cursor = 0;

	const worker = async (): Promise<void> => {
		while (true) {
			const index = cursor++;
			if (index >= targets.length) return;
			const target = targets[index]!;
			if (Date.now() >= deadline) {
				results[index] = failure(target.host, target.port, now().toISOString(), "BUDGET_EXCEEDED");
				continue;
			}
			let observation: CertificateObservation;
			try {
				observation = await probe(target);
			} catch (error) {
				observation = failure(target.host, target.port, now().toISOString(), errorCode(error));
			}
			for (let attempt = 0; attempt < retries; attempt += 1) {
				if (!isTransientError(observation.error)) break;
				if (Date.now() + RETRY_DELAY_MS >= deadline) break;
				const { promise: delay, resolve: wake } = Promise.withResolvers<void>();
				setTimeout(wake, RETRY_DELAY_MS);
				await delay;
				const retried = await probe(target);
				if (!retried.ok && isTransientError(retried.error)) continue;
				observation = retried;
				break;
			}
			results[index] = observation;
		}
	};

	const workers = Array.from({ length: Math.min(concurrency, targets.length) }, () => worker());
	await Promise.all(workers);
	return results;
}
