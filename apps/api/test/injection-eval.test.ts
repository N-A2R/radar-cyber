/**
 * Injection contrôlée : jeu synthétique, migration, critère SQL et période de
 * contrôle. Les deux premières mesures sont lues telles quelles dans la base
 * de test ; le jeu et le seed sont aussi vérifiés sans base.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import {
	buildScenarios,
	CONTROL_DAYS,
	EVAL_RUN_ID,
	INJECTION_SOURCES,
	LATENCY_CIBLE_S,
	lireCritereInjection,
	SCENARIO_COUNT,
	SCENARIOS,
	type InjectionRule,
} from "../src/eval/injection.js";

const REGLES: Record<InjectionRule, { family: string; assertionType: string }> = {
	"ransomware-revendication": { family: "ransomware", assertionType: "third_party_claim" },
	"incident-confirme": { family: "cti", assertionType: "confirmed_incident" },
	"fuite-donnees": { family: "cti", assertionType: "technical_indicator" },
	"avis-cert-fr": { family: "cert_fr", assertionType: "technical_indicator" },
	"certificat-observé": { family: "cert", assertionType: "technical_indicator" },
	"presse-cyber": { family: "presse", assertionType: "ambient_signal" },
};

const NOMBRE_REGLES = Object.keys(REGLES).length;
test("le jeu porte exactement 30 scénarios aux ids uniques et aux règles cohérentes", () => {
	const scenarios = buildScenarios();
	assert.equal(scenarios.length, SCENARIO_COUNT);
	assert.deepEqual(scenarios, SCENARIOS, "SCENARIOS doit rejouer buildScenarios()");
	const ids = scenarios.map((scenario) => scenario.id);
	assert.equal(new Set(ids).size, SCENARIO_COUNT);
	assert.deepEqual(
		[...ids].sort(),
		Array.from({ length: SCENARIO_COUNT }, (_, index) => `SC-${String(index + 1).padStart(2, "0")}`),
	);

	const parRegle = new Map<InjectionRule, number>();
	const organisationsReelles = [
		"ANSSI",
		"CERT-FR",
		"MICROSOFT",
		"GOOGLE",
		"AMAZON",
		"ORANGE",
		"TOTALENERGIES",
		"SNCF",
		"EDF",
	];
	for (const scenario of scenarios) {
		const regle = REGLES[scenario.rule];
		assert.ok(regle, `règle inconnue : ${scenario.rule}`);
		assert.equal(scenario.family, regle.family, `famille incohérente pour ${scenario.id}`);
		assert.equal(scenario.assertionType, regle.assertionType, `assertion incohérente pour ${scenario.id}`);
		parRegle.set(scenario.rule, (parRegle.get(scenario.rule) ?? 0) + 1);

		assert.match(scenario.orgName, /^Organisme fictif [A-Z]{3}-\d{2}$/);
		assert.ok(
			!organisationsReelles.some((nom) => scenario.orgName.toLocaleUpperCase("fr").includes(nom)),
			`organisation réelle dans ${scenario.id}`,
		);
		assert.match(`${scenario.title} ${scenario.summary}`, /fictif|synthétique/);
		assert.match(scenario.dept, /^\d{2,3}$/);
		assert.ok(scenario.city.length > 0);
	}
	assert.equal(parRegle.size, NOMBRE_REGLES);
	for (const effectif of parRegle.values()) assert.equal(effectif, SCENARIO_COUNT / NOMBRE_REGLES);
});

test("les sources de préproduction ne citent que example.invalid", () => {
	assert.equal(INJECTION_SOURCES.length, 4);
	for (const source of INJECTION_SOURCES) {
		const url = new URL(source.url);
		assert.equal(url.protocol, "https:");
		assert.ok(
			url.hostname === "example.invalid" || url.hostname.endsWith(".example.invalid"),
			`hôte non synthétique : ${url.hostname}`,
		);
	}
});

test("buildScenarios() est déterministe", () => {
	const scenarios = buildScenarios();
	assert.deepEqual(buildScenarios(), scenarios);
	assert.deepEqual(scenarios, SCENARIOS);
});

test("les tables et toutes leurs colonnes existent après migration", async () => {
	const colonnesAttendues: Record<string, readonly string[]> = {
		injection_eval: [
			"id",
			"run_id",
			"scenario_id",
			"control_period",
			"family",
			"rule_expected",
			"injected_at",
			"event_ids",
			"alert_ids",
			"detected",
			"alerted",
			"latency_s",
			"source",
			"measured_at",
		],
		injection_control_eval: [
			"id",
			"run_id",
			"control_day",
			"observed_day",
			"events_injected",
			"alerts",
			"alerted",
			"source",
			"measured_at",
		],
	};
	for (const [table, colonnes] of Object.entries(colonnesAttendues)) {
		const rows = await query<{ column_name: string }>(
			`SELECT column_name FROM information_schema.columns
			  WHERE table_schema = 'public' AND table_name = $1`,
			[table],
		);
		const presents = new Set(rows.rows.map((row) => row.column_name));
		for (const colonne of colonnes) {
			assert.ok(presents.has(colonne), `colonne ${table}.${colonne} absente`);
		}
	}
});

test("le critère SQL du seed : 30 lignes, taux >= 0,90 et zéro alerte en contrôle", async () => {
	const mesure = await query<{ taux: number; total: number }>(
		`SELECT count(*) FILTER (WHERE detected AND latency_s<=60)::float/count(*) AS taux,
		        count(*)::int AS total
		   FROM injection_eval`,
	);
	assert.equal(mesure.rows.length, 1);
	const { taux, total } = mesure.rows[0]!;
	assert.equal(Number(total), SCENARIO_COUNT, "le dénominateur doit être 30");
	assert.ok(Number(taux) >= 0.9, `taux ${taux} < 0,90`);

	const controle = await query<{ alertes_controle: number }>(
		"SELECT count(*)::int AS alertes_controle FROM injection_eval WHERE control_period AND alerted;",
	);
	assert.equal(controle.rows.length, 1);
	assert.equal(Number(controle.rows[0]!.alertes_controle), 0);

	const latences = await query<{ maximum: number; hors_cible: number }>(
		`SELECT COALESCE(max(latency_s), 0)::float AS maximum,
		        count(*) FILTER (WHERE latency_s IS NULL OR latency_s > 60)::int AS hors_cible
		   FROM injection_eval`,
	);
	assert.equal(Number(latences.rows[0]!.hors_cible), 0);
	assert.ok(Number(latences.rows[0]!.maximum) <= LATENCY_CIBLE_S);

	const critere = await lireCritereInjection();
	assert.equal(critere.total, SCENARIO_COUNT);
	assert.ok(critere.taux >= 0.9);
	assert.equal(critere.alertes_controle, 0);
});

test("la période de contrôle porte 30 jours consécutifs sans aucune alerte", async () => {
	const rows = await query<{
		run_id: string;
		control_day: number;
		observed_day: string;
		events_injected: number;
		alerts: number;
		alerted: boolean;
	}>(
		`SELECT run_id, control_day, to_char(observed_day, 'YYYY-MM-DD') AS observed_day,
		        events_injected, alerts, alerted
		   FROM injection_control_eval WHERE run_id = $1 ORDER BY control_day`,
		[EVAL_RUN_ID],
	);
	assert.equal(rows.rows.length, CONTROL_DAYS);
	let precedent: number | null = null;
	for (const [index, row] of rows.rows.entries()) {
		assert.equal(row.run_id, EVAL_RUN_ID);
		assert.equal(Number(row.control_day), index + 1);
		assert.ok(Number(row.events_injected) > 0);
		assert.equal(Number(row.alerts), 0);
		assert.equal(row.alerted, false);
		const observed = String(row.observed_day).slice(0, 10);
		const ms = Date.parse(`${observed}T00:00:00Z`);
		assert.ok(Number.isFinite(ms), `date de contrôle invalide : ${observed}`);
		if (precedent !== null) assert.equal(ms - precedent, 86_400_000, "jours non consécutifs");
		precedent = ms;
	}
	const critere = await lireCritereInjection();
	assert.equal(critere.jours_controle, CONTROL_DAYS);
	assert.equal(critere.alertes_jours_controle, 0);
});

after(async () => {
	await closePools();
});
