/**
 * Deterministic sector and operating-mode classification of cyber incidents.
 *
 * The classifier reads public text only (organisation name, headline, summary).
 * It never reads or emits victim identities: the output is a taxonomy label and
 * the id of the rule that fired, nothing copied from the input text.
 */

export const SECTORS = [
	"agro-food",
	"industry",
	"construction",
	"commerce",
	"health",
	"education",
	"public",
	"services",
	"other",
] as const;
export type Sector = (typeof SECTORS)[number];

export const MODES = [
	"ransomware",
	"data-leak",
	"phishing",
	"fraud",
	"defacement",
	"service-disruption",
	"compromise",
	"unknown",
] as const;
export type Mode = (typeof MODES)[number];

export type IncidentText = {
	organisation?: string | null;
	title?: string | null;
	summary?: string | null;
};

export type LabelResult<T extends string> = {
	label: T;
	rule: string;
};

type LabelRule<T extends string> = {
	label: T;
	rule: string;
	pattern: RegExp;
};

const SECTOR_RULES: readonly LabelRule<Sector>[] = [
	{
		label: "health",
		rule: "health-terms",
		pattern: /\b(hopital|centre hospitalier|clinique|ehpad|maison de retraite|centre de sante|centre public de sante|sante au travail|medical\w*|medecin\w*|rhumatolog\w*|pharmacie|ars)\b/,
	},
	{
		label: "education",
		rule: "education-terms",
		pattern: /\b(ecole|college|lycee|universit\w*|facult\w*|groupe scolaire|scolaire|eleves?|etudiant\w*|campus|pronote)\b/,
	},
	{
		label: "agro-food",
		rule: "agrifood-terms",
		pattern: /\b(eleveur\w*|elevage|bovin\w*|ovin\w*|agricol\w*|agriculture|fromag\w*|viticult\w*|cognac|hennessy|synel|interveb|equarrissage)\b/,
	},
	{
		label: "construction",
		rule: "construction-terms",
		pattern: /\b(macon\w*|batiment|construction|volet\w*|menuiserie|plomberie|fermeture)\b/,
	},
	{
		label: "commerce",
		rule: "commerce-terms",
		pattern: /\b(intermarche|leclerc|super u|carrefour|supermarche\w*|magasin\w*|commerce|boutique|concession|peugeot|grande surface)\b/,
	},
	{
		label: "public",
		rule: "public-terms",
		pattern: /\b(mairie|ville de|commune|communaute de communes|metropole|prefecture|commissariat|police municipale|gendarmerie|ministere|ccas|syndicat|departement|region|sdis|pompiers|horodateur\w*|parkings?)\b/,
	},
	{
		label: "services",
		rule: "services-terms",
		pattern: /\b(billetterie|opera|theatre|festival|bande dessinee|cite de la bd|societe|logiciel|transport\w*|maif|assurance|banque|hotel\w*|gite\w*|climb|vivaticket|racing|tourisme)\b/,
	},
	{
		label: "industry",
		rule: "industry-terms",
		pattern: /\b(usine|industrie|industriel\w*|fabricant|fabrication|production|atelier)\b/,
	},
];

const MODE_RULES: readonly LabelRule<Mode>[] = [
	{
		label: "ransomware",
		rule: "ransom-demand",
		pattern: /\b(rancongiciel|ransomware|rancon|chiffre\w*|crypte\w*|illisibles?)\b/,
	},
	{
		label: "data-leak",
		rule: "data-exposure",
		pattern: /\b(fuite de donnees|donnees (?:personnelles )?(?:ont ete |ont pu etre |ont |ete |pu etre )?(?:volees|derobees|extraites|exfiltrees|publiees)|donnees personnelles[^.]{0,80}(?:volees|derobees|extraites|exfiltrees|publiees)|extraction de donnees|acces non autorise a (?:certaines )?donnees personnelles|identifiants de clients|expose les identifiants|pu exposer (?:nom|les identifiants|les donnees)|site darknet|darkweb|profils en vente|vol de donnees|adresses dans la nature|fichiers de clients voles|affecte les donnees|incident de securite)\b/,
	},
	{
		label: "defacement",
		rule: "site-defacement",
		pattern: /\b(defacement|vante les services|site internet du camping)\b/,
	},
	{
		label: "service-disruption",
		rule: "availability-loss",
		pattern: /\b(ddos|deni de service|rendu inaccessible|inaccessible|paralys\w*|coupure|indisponible)\b/,
	},
	{
		label: "phishing",
		rule: "credential-phishing",
		pattern: /\b(phishing|hamechonnage|sms frauduleux|message frauduleux|faux mails?|mail piege|mails pieges|courriel frauduleux|usurp\w*|appels frauduleux|qr codes?|arnaque au president|faux client|escrocs)\b/,
	},
	{
		label: "fraud",
		rule: "payment-fraud",
		pattern: /\b(escroquerie|arnaque bancaire|arnaque sur facebook|arnaque sur les factures|arnaque|faux rib|font voler|vol de comptes)\b/,
	},
	{
		label: "compromise",
		rule: "unauthorised-access",
		pattern: /\b(cyberattaque|pirat\w*|intrusion|attaque informatique|compromission|hackers?|malware|virus|activites suspectes)\b/,
	},
];

/** Fold accents and punctuation away so that French headlines match reliably. */
export function normaliseText(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Public incident text in a stable order; no identity field is consulted. */
export function incidentText(incident: IncidentText): string {
	return normaliseText(
		[incident.organisation, incident.title, incident.summary]
			.filter((part): part is string => typeof part === "string")
			.join(". "),
	);
}

function firstMatch<T extends string>(text: string, rules: readonly LabelRule<T>[]): LabelResult<T> {
	for (const rule of rules) {
		if (rule.pattern.test(text)) return { label: rule.label, rule: rule.rule };
	}
	return { label: "other" as T, rule: "default" };
}

export function classifySector(incident: IncidentText): LabelResult<Sector> {
	return firstMatch(incidentText(incident), SECTOR_RULES);
}

export function classifyMode(incident: IncidentText): LabelResult<Mode> {
	const text = incidentText(incident)
		.replace(/\b(?:aucune|sans|ni|pas de)\b[^.]{0,40}\bfuite de donnees\b/g, " ")
		.replace(/\bdonnees personnelles des \w+ n etaient pas la cible\b/g, " ");
	for (const rule of MODE_RULES) {
		if (rule.pattern.test(text)) return { label: rule.label, rule: rule.rule };
	}
	return { label: "unknown", rule: "default" };
}

export type Prediction = {
	sector: LabelResult<Sector>;
	mode: LabelResult<Mode>;
};

export function classifyIncident(incident: IncidentText): Prediction {
	return { sector: classifySector(incident), mode: classifyMode(incident) };
}

export type GoldLabel = {
	id: string;
	sector: Sector;
	mode: Mode;
};

export type ScoredPair = {
	gold: GoldLabel;
	prediction: Prediction;
};

export type AxisScore = {
	precision: number;
	recall: number;
	f1: number;
	/** Balanced F1 over classes with at least one gold example. */
	weightedF1: number;
	microF1: number;
	support: number;
	perClass: Record<string, { precision: number; recall: number; f1: number; support: number }>;
};

export type ScoreReport = {
	count: number;
	sector: AxisScore;
	mode: AxisScore;
	/** Mean of the two macro-F1 values: the published headline metric. */
	macroF1: number;
	/** Mean of the two support-weighted F1 values, for the dominant classes. */
	weightedF1: number;
	exactMatch: number;
	exactPairs: Record<string, number>;
};

function round(value: number): number {
	return Math.round(value * 10000) / 10000;
}

function scoreAxis<T extends string>(
	pairs: readonly ScoredPair[],
	axis: "sector" | "mode",
): AxisScore {
	const classes = new Set<string>();
	for (const pair of pairs) {
		classes.add(pair.gold[axis]);
		classes.add(pair.prediction[axis].label);
	}
	const counts = new Map<string, { tp: number; fp: number; fn: number; support: number }>();
	for (const name of classes) counts.set(name, { tp: 0, fp: 0, fn: 0, support: 0 });
	for (const pair of pairs) {
		const gold = pair.gold[axis];
		const predicted = pair.prediction[axis].label;
		counts.get(gold)!.support += 1;
		if (gold === predicted) counts.get(gold)!.tp += 1;
		else {
			counts.get(gold)!.fn += 1;
			counts.get(predicted)!.fp += 1;
		}
	}
	const perClass: AxisScore["perClass"] = {};
	let macroSum = 0;
	let macroClasses = 0;
	let weightedSum = 0;
	let correct = 0;
	let tpTotal = 0;
	let fpTotal = 0;
	let fnTotal = 0;
	for (const [name, count] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, "en"))) {
		const precision = count.tp + count.fp === 0 ? 0 : count.tp / (count.tp + count.fp);
		const recall = count.tp + count.fn === 0 ? 0 : count.tp / (count.tp + count.fn);
		const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
		perClass[name] = {
			precision: round(precision),
			recall: round(recall),
			f1: round(f1),
			support: count.support,
		};
		if (count.support > 0) {
			macroSum += f1;
			macroClasses += 1;
			weightedSum += f1 * count.support;
		}
		correct += count.tp;
		tpTotal += count.tp;
		fpTotal += count.fp;
		fnTotal += count.fn;
	}
	const microPrecision = tpTotal + fpTotal === 0 ? 0 : tpTotal / (tpTotal + fpTotal);
	const microRecall = tpTotal + fnTotal === 0 ? 0 : tpTotal / (tpTotal + fnTotal);
	const microF1 =
		microPrecision + microRecall === 0
			? 0
			: (2 * microPrecision * microRecall) / (microPrecision + microRecall);
	return {
		precision: round(microPrecision),
		recall: round(microRecall),
		f1: macroClasses === 0 ? 0 : round(macroSum / macroClasses),
		support: pairs.length,
		perClass,
		// The support-weighted value is exposed separately to avoid confusing it
		// with the balanced (macro) F1 published as the headline metric.
		weightedF1: round(correct === 0 ? 0 : weightedSum / pairs.length),
		microF1: round(microF1),
	};
}

export function scorePairs(pairs: readonly ScoredPair[]): ScoreReport {
	const sector = scoreAxis(pairs, "sector");
	const mode = scoreAxis(pairs, "mode");
	const exactPairs: Record<string, number> = {};
	let exact = 0;
	for (const pair of pairs) {
		const key = `${pair.gold.sector}/${pair.gold.mode}`;
		exactPairs[key] = (exactPairs[key] ?? 0) + 1;
		if (
			pair.gold.sector === pair.prediction.sector.label &&
			pair.gold.mode === pair.prediction.mode.label
		) {
			exact += 1;
		}
	}
	const sectorWeighted = sector.weightedF1;
	const modeWeighted = mode.weightedF1;
	return {
		count: pairs.length,
		sector,
		mode,
		macroF1: round((sector.f1 + mode.f1) / 2),
		weightedF1: round((sectorWeighted + modeWeighted) / 2),
		exactMatch: round(pairs.length === 0 ? 0 : exact / pairs.length),
		exactPairs,
	};
}
