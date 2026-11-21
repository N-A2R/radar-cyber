/**
 * File de revue des rattachements non résolus.
 *
 * Les trois routes sont authentifiées : la file expose des revendications
 * TLP:RED et chaque décision porte son auteur. Elle réutilise la file de
 * quarantaine existante (`quarantine/review.ts`) et le moteur de promotion
 * (`quarantine/promote.ts`) — aucune deuxième règle de rattachement ici.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query, withTransaction } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { evaluateEvent } from "../detect/engine.js";
import { consignerAvec } from "../journal/index.js";
import { promoteOneTx } from "../quarantine/promote.js";
import { appendReview, applyReview, reviewQueue, type ReviewEntry } from "../quarantine/review.js";
import type { TriageBucket } from "../quarantine/triage.js";

const QueueQuery = z.object({
	limit: z.coerce.number().int().min(1).max(200).default(50),
	page: z.coerce.number().int().min(0).default(0),
	bucket: z.enum(["chaud", "tiede", "froid"]).optional(),
	q: z.string().trim().max(200).optional(),
});

const DecisionBody = z.object({
	decision: z.enum(["accepter", "refuser"]),
	orgId: z.number().int().positive().optional(),
	raison: z.string().trim().min(1).max(500),
}).strict().refine(
	(body) => body.decision !== "accepter" || body.orgId !== undefined,
	{ message: "orgId requis pour une acceptation", path: ["orgId"] },
);

function badRequest(reply: { code: (n: number) => { send: (body: unknown) => unknown } }, error: z.ZodError) {
	return reply.code(400).send({
		error: "invalid input",
		details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
	});
}

export default async function (app: FastifyInstance) {
	/** Revendications en attente avec indice, candidats et règle de refus. */
	app.get("/review/queue", { preHandler: requireAuth() }, async (req, reply) => {
		const parsed = QueueQuery.safeParse(req.query ?? {});
		if (!parsed.success) return badRequest(reply, parsed.error);
		const { limit, page, bucket, q } = parsed.data;
		const result = await reviewQueue({
			status: "pending",
			onlyPendingWithHint: true,
			enriched: true,
			limit,
			page,
			bucket: bucket as TriageBucket | undefined,
			q: q ?? null,
		});
		return {
			rows: result.rows.map((row) => ({
				id: row.id,
				source: row.source,
				sourceUrl: row.sourceUrl,
				groupe: row.groupe,
				orgHint: row.orgHint,
				claimedAt: row.claimedAt,
				receivedAt: row.receivedAt,
				tlp: row.tlp,
				triage: row.triage,
				candidates: row.candidates ?? [],
				rejectRule: row.rejectRule ?? null,
				city: row.city ?? null,
				dept: row.dept ?? null,
				review: row.review,
			})),
			total: result.total,
			page: result.page,
			limit: result.limit,
			window: result.window,
			truncated: result.truncated,
			counts: result.counts,
			tookMs: result.tookMs,
		};
	});

	/** Comptes lus en base : file, décisions humaines et promotions. */
	app.get("/review/stats", { preHandler: requireAuth() }, async () => {
		const [pending, acceptees, refusees, promues] = await Promise.all([
			query<{ n: number }>(
				`SELECT count(*)::int AS n FROM quarantine_raw
				  WHERE kind='claim' AND status='pending' AND promoted=false
				    AND org_hint IS NOT NULL AND btrim(org_hint) <> ''`,
			),
			query<{ n: number }>(
				`SELECT count(DISTINCT subject)::int AS n FROM journal
				  WHERE kind='review.decided'
				    AND (payload->>'decision'='accepter' OR payload->>'action'='promote')`,
			),
			query<{ n: number }>(
				`SELECT count(DISTINCT subject)::int AS n FROM journal
				  WHERE kind='review.decided'
				    AND (payload->>'decision'='refuser' OR payload->>'action'='reject')`,
			),
			query<{ n: number }>("SELECT count(*)::int AS n FROM quarantine_raw WHERE promoted=true"),
		]);
		return {
			pending: pending.rows[0]?.n ?? 0,
			acceptees: acceptees.rows[0]?.n ?? 0,
			refusees: refusees.rows[0]?.n ?? 0,
			promues: promues.rows[0]?.n ?? 0,
		};
	});

	/**
	 * Décision sur une ligne : accepter attache l'organisation choisie en créant
	 * l'événement public, refuser classe la ligne. Les deux écrivent le motif et
	 * l'auteur dans le journal et dans l'historique de la ligne.
	 */
	app.post<{ Params: { id: string } }>(
		"/review/:id/decision",
		{ preHandler: requireAuth() },
		async (req, reply) => {
			const id = Number(req.params.id);
			if (!Number.isInteger(id) || id <= 0) {
				return reply.code(400).send({ error: "invalid id" });
			}
			const parsed = DecisionBody.safeParse(req.body ?? {});
			if (!parsed.success) return badRequest(reply, parsed.error);
			const { decision, raison } = parsed.data;
			const orgId = parsed.data.orgId;
			const actor = req.user!.email;

			const current = await query<{ status: string; promoted: boolean }>(
				"SELECT status, promoted FROM quarantine_raw WHERE id=$1", [id],
			);
			if (!current.rows[0]) return reply.code(404).send({ error: "not found" });
			if (current.rows[0].promoted || current.rows[0].status !== "pending") {
				return reply.code(409).send({ error: "already decided" });
			}

			if (decision === "accepter") {
				const org = await query<{ name: string }>("SELECT name FROM org WHERE id=$1", [orgId]);
				if (!org.rows[0]) return reply.code(404).send({ error: "organisation introuvable" });
				const entry: ReviewEntry = {
					at: new Date().toISOString(), by: actor, action: "promote", reason: raison,
				};
				const promoted = await withTransaction(async (client) => {
					const result = await promoteOneTx(client, id, actor, {
						orgId: orgId!, orgName: org.rows[0].name,
					});
					if (!result.found || result.alreadyPromoted) return null;
					await appendReview(id, entry, client);
					const trace = await consignerAvec(
						(sql, params) => client.query(sql, params as unknown[]),
						{
							kind: "review.decided",
							subject: `quarantine:${id}`,
							summary: `accepter par ${actor} — ${raison}`,
							actor: `humain:${actor}`,
							payload: {
								decision: "accepter",
								action: "promote",
								reason: raison,
								orgId,
								orgName: org.rows[0].name,
								statutApplique: "promoted",
								eventId: result.eventId,
								quarantineId: id,
							},
						},
					);
					if (!trace.ok) throw new Error(`journal indisponible : ${trace.error}`);
					return result;
				});
				if (!promoted) return reply.code(409).send({ error: "already decided" });
				const alerts = promoted.inserted && promoted.eventId !== null
					? await evaluateEvent(promoted.eventId, { force: true })
					: 0;
				return {
					id, decision, orgId, orgName: org.rows[0].name,
					status: "promoted", eventId: promoted.eventId, alerts,
					reason: raison, by: actor,
				};
			}

			const outcome = await applyReview([id], "reject", raison, actor);
			if (outcome.changed === 0) return reply.code(409).send({ error: "already decided" });
			if (outcome.journalErreurs > 0) {
				return reply.code(500).send({ error: "journal indisponible", outcome });
			}
			return {
				id, decision, status: "rejected", reason: raison, by: actor,
				journalConsignes: outcome.journalConsignes,
				journalLacunes: outcome.journalLacunes,
			};
		},
	);
}
