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
	/** Extra attempts for transient transport failures; HTTP responses are observations, not retries. */
	retries?: number;
	fetchImpl?: typeof fetch;
	now?: () => Date;
};

/** One bounded campaign: probed services are recorded, unprobed ones are named. */
export type ProbeCampaign = {
	observations: DailyObservation[];
	/** Services never probed before the deadline; never emitted as fake observations. */
	missingServiceIds: string[];
};

const DEFAULT_TIMEOUT_MS = 6_000;
const DEFAULT_DEADLINE_MS = 45_000;
const DEFAULT_CONCURRENCY = 50;
const DEFAULT_RETRIES = 1;
const TRANSIENT_FAILURES: Record<string, true> = { timeout: true, network_error: true };

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
	const started = now().getTime();
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
			latencyMs: Math.max(0, now().getTime() - started),
			observedAt,
			failure: null,
		};
	} catch (error) {
		return {
			serviceId: service.id,
			day: observedAt.slice(0, 10),
			ok: false,
			status: null,
			latencyMs: Math.max(0, now().getTime() - started),
			observedAt,
			failure: failureCode(error),
		};
	}
}

/**
 * Probe the perimeter in bounded batches. Transport failures get at most
 * `retries` extra attempts while the global deadline holds; a real HTTP
 * response is one observation and is never retried. Services left when the
 * deadline expires are listed as missing, never counted as available or down.
 */
export async function probeCampaign(
	services: PublicService[],
	options: ProbeOptions = {}
): Promise<ProbeCampaign> {
	const now = options.now ?? (() => new Date());
	const deadline = now().getTime() + Math.max(0, options.deadlineMs ?? DEFAULT_DEADLINE_MS);
	const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
	const retries = Math.max(0, Math.floor(options.retries ?? DEFAULT_RETRIES));
	const observations: DailyObservation[] = [];
	const attempted = new Set<string>();

	for (let offset = 0; offset < services.length; offset += concurrency) {
		if (now().getTime() >= deadline) break;
		const batch = services.slice(offset, offset + concurrency);
		const results = await Promise.all(batch.map(async (service) => {
			let observation = await probeService(service, {
				...options,
				timeoutMs: Math.max(1, Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, deadline - now().getTime())),
			});
			attempted.add(service.id);
			for (let attempt = 0; attempt < retries; attempt += 1) {
				const remaining = deadline - now().getTime();
				if (observation.failure === null || TRANSIENT_FAILURES[observation.failure] !== true || remaining <= 0) break;
				observation = await probeService(service, {
					...options,
					timeoutMs: Math.max(1, Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, remaining)),
				});
			}
			return observation;
		}));
		observations.push(...results);
	}

	return {
		observations,
		missingServiceIds: services.filter((service) => !attempted.has(service.id)).map((service) => service.id),
	};
}

/** Observations-only view for callers that do not consume missing-service reporting. */
export async function probeAll(
	services: PublicService[],
	options: ProbeOptions = {}
): Promise<DailyObservation[]> {
	return (await probeCampaign(services, options)).observations;
}
