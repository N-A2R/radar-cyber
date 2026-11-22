/**
 * Bounded HTTP observation of a public service.
 *
 * Only the response status and timing are kept: no body, no headers carrying
 * personal data, no cookies and no redirect target content. Every call has a
 * per-request timeout and the campaign has a global deadline so no command can
 * run longer than a minute.
 */
import type { PublicService } from "./perimeter.js";

export type DailyObservation = {
	serviceId: string;
	day: string;
	ok: boolean;
	status: number | null;
	latencyMs: number;
	observedAt: string;
	failure: string | null;
};

export type ProbeOptions = {
	timeoutMs?: number;
	deadlineMs?: number;
	concurrency?: number;
	fetchImpl?: typeof fetch;
	now?: () => Date;
};

const DEFAULT_TIMEOUT_MS = 6_000;
const DEFAULT_DEADLINE_MS = 45_000;
const DEFAULT_CONCURRENCY = 50;

/** Convert a transport error into a stable, non-identifying code. */
export function failureCode(error: unknown): string {
	if (error instanceof Error && error.name === "TimeoutError") return "timeout";
	if (error instanceof Error && error.name === "AbortError") return "timeout";
	if (error instanceof Error && /timed out/i.test(error.message)) return "timeout";
	return "network_error";
}

export async function probeService(
	service: PublicService,
	options: ProbeOptions = {}
): Promise<DailyObservation> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const now = options.now ?? (() => new Date());
	const fetchImpl = options.fetchImpl ?? fetch;
	const started = Date.now();
	const observedAt = now().toISOString();
	try {
		const response = await fetchImpl(service.url, {
			redirect: "follow",
			signal: AbortSignal.timeout(timeoutMs),
		});
		await response.body?.cancel();
		return {
			serviceId: service.id,
			day: observedAt.slice(0, 10),
			ok: response.status >= 200 && response.status < 400,
			status: response.status,
			latencyMs: Date.now() - started,
			observedAt,
			failure: null,
		};
	} catch (error) {
		return {
			serviceId: service.id,
			day: observedAt.slice(0, 10),
			ok: false,
			status: null,
			latencyMs: Date.now() - started,
			observedAt,
			failure: failureCode(error),
		};
	}
}

/**
 * Probe the perimeter in bounded batches. Services left when the deadline
 * expires are simply unobserved; they are never silently counted as available.
 */
export async function probeAll(services: PublicService[], options: ProbeOptions = {}): Promise<DailyObservation[]> {
	const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
	const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
	const deadline = Date.now() + deadlineMs;
	const observations: DailyObservation[] = [];
	for (let offset = 0; offset < services.length; offset += concurrency) {
		if (Date.now() >= deadline) break;
		const batch = services.slice(offset, offset + concurrency);
		const results = await Promise.all(batch.map((service) => probeService(service, options)));
		observations.push(...results);
	}
	return observations;
}
