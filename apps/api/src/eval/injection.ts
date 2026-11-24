/**
 * Injection contrôlée en préproduction : mesurer le détecteur, pas le déclarer.
 *
 * Trente scénarios synthétiques (aucune victime réelle, aucune source nationale
 * présentée comme locale) sont écrits comme de vrais événements, puis soumis au
 * moteur d'alertes réel. Les résultats observés alimentent `injection_eval`.
 * La période de contrôle de trente jours utilise des événements bénins et est
 * mesurée séparément dans `injection_control_eval`.
 */
import { ingestQuery, query } from "../db.js";
import { evaluateEvent, loadCorroborationContext } from "../detect/engine.js";

/** Identifiant stable du jeu d'évaluation : une seule mesure fait foi dans la table. */
export const EVAL_RUN_ID = "injection-eval-v1";
/** Nombre de scénarios actifs et de jours de contrôle. */
export const SCENARIO_COUNT = 30;
export const CONTROL_DAYS = 30;
/** La cible du chantier : alerte visible au plus tard 60 s après l'injection. */
export const LATENCY_CIBLE_S = 60;

export type InjectionRule =
	| "ransomware-revendication"
	| "incident-confirme"
	| "fuite-donnees"
	| "avis-cert-fr"
	| "certificat-observé"
	| "presse-cyber";

export type InjectionScenario = {
	id: string;
	rule: InjectionRule;
	family: string;
	assertionType: string;
	title: string;
	summary: string;
	orgName: string;
	kind: string;
	city: string;
	dept: string;
};

type Theme = { code: string; label: string; kind: string; city: string; dept: string };

const THEMES: readonly Theme[] = [
	{ code: "MUN", label: "service municipal", kind: "collectivite", city: "Bordeaux", dept: "33" },
	{ code: "SAN", label: "établissement de santé", kind: "sante", city: "Limoges", dept: "87" },
	{ code: "ENS", label: "établissement scolaire", kind: "enseignement", city: "Poitiers", dept: "86" },
	{ code: "OPE", label: "opérateur régional", kind: "entreprise", city: "Angoulême", dept: "16" },
	{ code: "ASS", label: "association locale", kind: "association", city: "La Rochelle", dept: "17" },
];

type RuleSpec = {
	rule: InjectionRule;
	family: string;
	assertionType: string;
	verbe: string;
};

const RULES: readonly RuleSpec[] = [
	{
		rule: "ransomware-revendication",
		family: "ransomware",
		assertionType: "third_party_claim",
		verbe: "revendication de rançongiciel visant",
	},
	{
		rule: "incident-confirme",
		family: "cti",
		assertionType: "confirmed_incident",
		verbe: "intrusion confirmée chez",
	},
	{
		rule: "fuite-donnees",
		family: "cti",
		assertionType: "technical_indicator",
		verbe: "fuite de données concernant",
	},
	{
		rule: "avis-cert-fr",
		family: "cert_fr",
		assertionType: "technical_indicator",
		verbe: "avis de sécurité (famille CERT-FR) relatif à",
	},
	{
		rule: "certificat-observé",
		family: "cert",
		assertionType: "technical_indicator",
		verbe: "certificat TLS observé pour",
	},
	{
		rule: "presse-cyber",
		family: "presse",
		assertionType: "ambient_signal",
		verbe: "article de presse cyber sur",
	},
];

/**
 * Jeu de scénarios déterministe et purement synthétique.
 *
 * Les trois sources distinctes par scénario ne sont pas une astuce de score :
 * c'est la règle de corroboration réelle du moteur. Leurs titres diffèrent pour
 * ne pas être écrasés par le dédoublage inter-flux (même fait, même jour).
 */
export function buildScenarios(): InjectionScenario[] {
	const scenarios: InjectionScenario[] = [];
	for (const spec of RULES) {
		for (const theme of THEMES) {
			const numero = String(scenarios.length + 1).padStart(2, "0");
			const slug = `${spec.rule}-${theme.code}`.toLowerCase();
			scenarios.push({
				id: `SC-${numero}`,
				rule: spec.rule,
				family: spec.family,
				assertionType: spec.assertionType,
				title: `Injection contrôlée SC-${numero} — ${spec.verbe} un ${theme.label} fictif de Nouvelle-Aquitaine`,
				summary: `Scénario synthétique ${slug} : exercice de mesure sur un ${theme.label} fictif (${theme.city}). Aucune victime réelle, aucune donnée personnelle.`,
				orgName: `Organisme fictif ${theme.code}-${numero}`,
				kind: theme.kind,
				city: theme.city,
				dept: theme.dept,
			});
		}
	}
	return scenarios;
}

export const SCENARIOS: readonly InjectionScenario[] = buildScenarios();

const SOURCE_IDS = ["injection-eval-src-a", "injection-eval-src-b", "injection-eval-src-c"] as const;
const CONTROL_SOURCE_ID = "injection-eval-control";
const SOURCE_LABELS = ["source A", "source B", "source C"] as const;

/** Sources de préproduction : toutes les URL de preuve restent sous example.invalid. */
export const INJECTION_SOURCES = Object.freeze(
	[...SOURCE_IDS, CONTROL_SOURCE_ID].map((id) => ({
		id,
		url: `https://injection.example.invalid/${id}`,
	})),
);

export type InjectionResult = {
	scenario: InjectionScenario;
	eventIds: number[];
	alertIds: number[];
	detected: boolean;
	injectedAt: string;
	latencyS: number;
};

export type ControlResult = {
	controlDay: number;
	observedDay: string;
	eventIds: number[];
	alerts: number;
};

export type InjectionReport = {
	runId: string;
	attempt: string;
	scenarios: InjectionResult[];
	control: ControlResult[];
	detected: number;
	rate: number;
	latencyMaxS: number;
	controlAlerts: number;
};

async function ensureSources(): Promise<void> {
	for (const source of INJECTION_SOURCES) {
		await ingestQuery(
			`INSERT INTO source (id, name, family, url, enabled)
			 VALUES ($1, $2, 'injection', $3, true)
			 ON CONFLICT (id) DO UPDATE SET enabled = true, name = EXCLUDED.name`,
			[source.id, `Injection contrôlée — ${source.id}`, source.url],
		);
	}
}

async function createRun(sourceId: string): Promise<number> {
	const res = await ingestQuery<{ id: number }>(
		`INSERT INTO collector_run (source_id, started_at, finished_at, status, items_in, items_new, kind)
		 VALUES ($1, now(), now(), 'ok', 1, 1, 'injection') RETURNING id`,
		[sourceId],
	);
	const id = res.rows[0]?.id;
	if (id == null) throw new Error(`collector_run non créé pour ${sourceId}`);
	return Number(id);
}

async function createOrg(scenario: InjectionScenario, attempt: string): Promise<number> {
	const res = await ingestQuery<{ id: number }>(
		`INSERT INTO org (name, slug, kind, city, dept, status, domain)
		 VALUES ($1, $2, $3, $4, $5, 'confirme', $6) RETURNING id`,
		[
			scenario.orgName,
			`injection-${attempt}-${scenario.id.toLowerCase()}`,
			scenario.kind,
			scenario.city,
			scenario.dept,
			`injection-${scenario.id.toLowerCase()}.example.invalid`,
		],
	);
	const id = res.rows[0]?.id;
	if (id == null) throw new Error(`organisation non créée pour ${scenario.id}`);
	return Number(id);
}

async function insertEvent(input: {
	dedupKey: string;
	family: string;
	assertionType: string;
	title: string;
	summary: string;
	sourceId: string;
	sourceUrl: string;
	evidence: Record<string, unknown>;
	orgId: number | null;
	dept: string | null;
	regional: boolean;
	observedAt?: Date;
}): Promise<number> {
	const res = await ingestQuery<{ id: number }>(
		`INSERT INTO event
		   (dedup_key, family, assertion_type, title, summary, observed_at, severity,
		    confidence, source_id, source_url, evidence, geo_type, org_id, dept,
		    regional, tlp, langue, pertinence_score)
		 VALUES
		   ($1, $2, $3, $4, $5, COALESCE($6, now()), 4, 'A1', $7, $8, $9::jsonb,
		    CASE WHEN $10::int IS NULL THEN 'unknown' ELSE 'entity_location' END,
		    $10, $11, $12, 'AMBER', 'fr', 10)
		 RETURNING id`,
		[
			input.dedupKey,
			input.family,
			input.assertionType,
			input.title,
			input.summary,
			input.observedAt ?? null,
			input.sourceId,
			input.sourceUrl,
			JSON.stringify(input.evidence),
			input.orgId,
			input.dept,
			input.regional,
		],
	);
	const id = res.rows[0]?.id;
	if (id == null) throw new Error(`événement non créé pour ${input.dedupKey}`);
	return Number(id);
}

async function alertsFor(eventIds: readonly number[]): Promise<number[]> {
	if (eventIds.length === 0) return [];
	const res = await query<{ id: number }>(
		"SELECT id FROM alert WHERE event_id = ANY($1::int[]) ORDER BY id",
		[[...eventIds]],
	);
	return res.rows.map((row) => Number(row.id));
}

/**
 * Injecte puis évalue. Le chronomètre démarre avant la première écriture :
 * la latence couvre l'écriture, la passe de détection et la visibilité en base.
 */
async function injectScenario(
	scenario: InjectionScenario,
	attempt: string,
	runIds: Record<string, number>,
): Promise<InjectionResult> {
	const started = Date.now();
	const orgId = await createOrg(scenario, attempt);
	const observedAt = new Date();
	const eventIds: number[] = [];
	for (let index = 0; index < SOURCE_IDS.length; index++) {
		const sourceId = SOURCE_IDS[index]!;
		const label = SOURCE_LABELS[index]!;
		eventIds.push(
			await insertEvent({
				dedupKey: `injection-eval:${attempt}:${scenario.id}:${sourceId}`,
				family: scenario.family,
				assertionType: scenario.assertionType,
				title: `${scenario.title} (${label})`,
				summary: scenario.summary,
				sourceId,
				sourceUrl: `https://injection.example.invalid/${attempt}/${scenario.id}/${sourceId}`,
				evidence: {
					run_id: String(runIds[sourceId]),
					source: "injection-eval",
					synthetic: true,
					scenario_id: scenario.id,
				},
				orgId,
				dept: scenario.dept,
				regional: true,
				observedAt,
			}),
		);
	}

	const corroboration = await loadCorroborationContext([orgId], observedAt);
	for (const eventId of eventIds) await evaluateEvent(eventId, { corroboration });
	const alertIds = await alertsFor(eventIds);
	const latencyS = Number(((Date.now() - started) / 1000).toFixed(3));
	return {
		scenario,
		eventIds,
		alertIds,
		detected: alertIds.length > 0,
		injectedAt: new Date(started).toISOString(),
		latencyS,
	};
}

/** Trente jours d'événements bénins : aucune règle ne doit s'y appliquer. */
async function injectControl(attempt: string, runId: number, now: Date): Promise<ControlResult[]> {
	const results: ControlResult[] = [];
	for (let day = 1; day <= CONTROL_DAYS; day++) {
		const observedAt = new Date(now.getTime() - (CONTROL_DAYS - day) * 86_400_000);
		const eventId = await insertEvent({
			dedupKey: `injection-eval-control:${attempt}:J${String(day).padStart(2, "0")}`,
			family: "ambient",
			assertionType: "ambient_signal",
			title: `Journal de veille synthétique — jour ${day} — aucun signal cyber`,
			summary: "Observation bénigne de préproduction : agenda et météo régionale, sans fait cyber.",
			sourceId: CONTROL_SOURCE_ID,
			sourceUrl: `https://injection.example.invalid/${attempt}/controle/J${day}`,
			evidence: {
				run_id: String(runId),
				source: "injection-eval-control",
				synthetic: true,
				control_day: day,
			},
			orgId: null,
			dept: null,
			regional: false,
			observedAt,
		});
		await evaluateEvent(eventId);
		const alertIds = await alertsFor([eventId]);
		results.push({
			controlDay: day,
			observedDay: observedAt.toISOString().slice(0, 10),
			eventIds: [eventId],
			alerts: alertIds.length,
		});
	}
	return results;
}

async function persist(results: InjectionResult[], control: ControlResult[], attempt: string): Promise<void> {
	await ingestQuery("DELETE FROM injection_eval WHERE run_id = $1", [EVAL_RUN_ID]);
	await ingestQuery("DELETE FROM injection_control_eval WHERE run_id = $1", [EVAL_RUN_ID]);
	for (const result of results) {
		await ingestQuery(
			`INSERT INTO injection_eval
			   (run_id, scenario_id, control_period, family, rule_expected, injected_at,
			    event_ids, alert_ids, detected, alerted, latency_s, source)
			 VALUES
			   ($1, $2, false, $3, $4, $5, $6::bigint[], $7::int[], $8, $9, $10, $11)
			 ON CONFLICT (run_id, scenario_id) DO UPDATE SET
			   family = EXCLUDED.family, rule_expected = EXCLUDED.rule_expected,
			   injected_at = EXCLUDED.injected_at, event_ids = EXCLUDED.event_ids,
			   alert_ids = EXCLUDED.alert_ids, detected = EXCLUDED.detected,
			   alerted = EXCLUDED.alerted, latency_s = EXCLUDED.latency_s,
			   source = EXCLUDED.source, measured_at = now()`,
			[
				EVAL_RUN_ID,
				result.scenario.id,
				result.scenario.family,
				result.scenario.rule,
				result.injectedAt,
				result.eventIds,
				result.alertIds,
				result.detected,
				result.alertIds.length > 0,
				result.latencyS,
				`injection-eval@${attempt}`,
			],
		);
	}
	for (const day of control) {
		await ingestQuery(
			`INSERT INTO injection_control_eval
			   (run_id, control_day, observed_day, events_injected, alerts, alerted, source)
			 VALUES ($1, $2, $3::date, $4, $5, $6, $7)
			 ON CONFLICT (run_id, control_day) DO UPDATE SET
			   observed_day = EXCLUDED.observed_day, events_injected = EXCLUDED.events_injected,
			   alerts = EXCLUDED.alerts, alerted = EXCLUDED.alerted,
			   source = EXCLUDED.source, measured_at = now()`,
			[
				EVAL_RUN_ID,
				day.controlDay,
				day.observedDay,
				day.eventIds.length,
				day.alerts,
				day.alerts > 0,
				`injection-eval@${attempt}`,
			],
		);
	}
}

/** Mesure complète : injection, détection réelle, contrôle 30 jours, publication en base. */
export async function mesurerInjection(opts: { attempt?: string; now?: Date } = {}): Promise<InjectionReport> {
	const attempt = opts.attempt ?? `${Date.now()}-${process.pid}`;
	const now = opts.now ?? new Date();
	await ensureSources();
	const runIds: Record<string, number> = {};
	for (const sourceId of SOURCE_IDS) runIds[sourceId] = await createRun(sourceId);
	const controlRunId = await createRun(CONTROL_SOURCE_ID);

	const scenarios: InjectionResult[] = [];
	for (const scenario of SCENARIOS) scenarios.push(await injectScenario(scenario, attempt, runIds));
	const control = await injectControl(attempt, controlRunId, now);
	await persist(scenarios, control, attempt);

	const detected = scenarios.filter((r) => r.detected && r.latencyS <= LATENCY_CIBLE_S).length;
	return {
		runId: EVAL_RUN_ID,
		attempt,
		scenarios,
		control,
		detected,
		rate: detected / scenarios.length,
		latencyMaxS: Math.max(...scenarios.map((r) => r.latencyS)),
		controlAlerts: control.reduce((sum, day) => sum + day.alerts, 0),
	};
}

export type InjectionCriteria = {
	taux: number;
	total: number;
	alertes_controle: number;
	jours_controle: number;
	alertes_jours_controle: number;
};

/** Les deux requêtes du critère, exécutées telles quelles sur la base. */
export async function lireCritereInjection(): Promise<InjectionCriteria> {
	const taux = await query<{ taux: number; total: number }>(
		`SELECT count(*) FILTER (WHERE detected AND latency_s<=60)::float/count(*) AS taux,
		        count(*)::int AS total
		   FROM injection_eval`,
	);
	const controle = await query<{ alertes_controle: number }>(
		"SELECT count(*)::int AS alertes_controle FROM injection_eval WHERE control_period AND alerted;",
	);
	const jours = await query<{ jours_controle: number; alertes_jours_controle: number }>(
		`SELECT count(*)::int AS jours_controle,
		        COALESCE(sum(alerts), 0)::int AS alertes_jours_controle
		   FROM injection_control_eval WHERE run_id = $1`,
		[EVAL_RUN_ID],
	);
	return {
		taux: taux.rows[0]?.taux ?? 0,
		total: taux.rows[0]?.total ?? 0,
		alertes_controle: controle.rows[0]?.alertes_controle ?? 0,
		jours_controle: jours.rows[0]?.jours_controle ?? 0,
		alertes_jours_controle: jours.rows[0]?.alertes_jours_controle ?? 0,
	};
}
