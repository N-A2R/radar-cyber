/**
 * Validation des données collectées à l'extérieur du sandbox.
 *
 * Contexte : le réseau du sandbox est filtré (API gouv, presse, CERT-FR
 * injoignables). La collecte est donc déléguée, et ce qui revient doit être
 * vérifié avant d'être chargé — sinon on importe des SIREN faux, des codes
 * INSEE inventés ou des dates reformatées en silence.
 *
 * Aucune dépendance, aucune base, aucun réseau :
 *
 *   node scripts/validate-external-data.mts
 *   node scripts/validate-external-data.mts --dir=/chemin
 *   node scripts/validate-external-data.mts --bloc=entreprises
 *   node scripts/validate-external-data.mts --livraison   # contrôle final
 *
 * Sort en code 1 s'il reste une erreur. Les avertissements n'empêchent pas le
 * chargement : ils signalent ce qu'un humain doit regarder.
 *
 * **Une livraison vide est un échec, pas un succès.** Première version : les
 * fichiers absents n'étaient que des avertissements, si bien qu'un dépôt sans
 * aucune donnée affichait « 0 erreur, structure conforme » et sortait en 0. Un
 * collecteur pouvait s'en prévaloir sans avoir rien produit — c'est arrivé.
 * Aucun fichier livré ⇒ erreur. `--livraison` exige en plus le compte rendu.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const argv = process.argv.slice(2);
const dirArg = argv.find((a) => a.startsWith("--dir="));
const blocArg = argv.find((a) => a.startsWith("--bloc="));
const BASE = dirArg ? dirArg.slice(6) : ROOT;
const ONLY = blocArg ? blocArg.slice(7) : "all";
const FINAL = argv.includes("--livraison");

/** Fichiers de données attendus, et combien sont réellement présents. */
const EXPECTED = [
	"db/data/entreprises-na.json",
	"db/data/sante-na.json",
	"db/data/enseignement-na.json",
	"bench/fixtures/corpus-temoin-na.json",
	"bench/results/sources-probe.json",
];

const DEPTS_NA = new Set(["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NAF = /^\d{2}\.?\d{2}[A-Z]?$/;

type Level = "erreur" | "avertissement";
type Issue = { level: Level; bloc: string; where: string; message: string };
const issues: Issue[] = [];
const counts = new Map<string, number>();

function err(bloc: string, where: string, message: string): void {
	issues.push({ level: "erreur", bloc, where, message });
}
function warn(bloc: string, where: string, message: string): void {
	issues.push({ level: "avertissement", bloc, where, message });
}

function loadJson(relative: string): unknown | null {
	const path = join(BASE, relative);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		err("format", relative, `JSON illisible : ${String((error as Error).message).slice(0, 120)}`);
		return null;
	}
}

/** Codes INSEE connus du jeu versionné : sert de vérité terrain locale. */
function knownCommunes(): Map<string, string> {
	const map = new Map<string, string>();
	const ref = loadJson("db/data/referentiel-na.json") as { communes?: Array<{ code: string; departement: string }> } | null;
	for (const c of ref?.communes ?? []) map.set(c.code, c.departement);
	return map;
}

/**
 * SIREN : 9 chiffres, clé de Luhn. Exception La Poste (356000000) : la somme
 * des chiffres est un multiple de 5, Luhn ne s'applique pas.
 */
function validSiren(value: unknown): boolean {
	if (typeof value !== "string" || !/^\d{9}$/.test(value)) return false;
	if (value.startsWith("356")) {
		const sum = [...value].reduce((total, digit) => total + Number(digit), 0);
		return sum % 5 === 0;
	}
	let sum = 0;
	for (let i = 0; i < 9; i++) {
		let digit = Number(value[i]);
		if (i % 2 === 1) {
			digit *= 2;
			if (digit > 9) digit -= 9;
		}
		sum += digit;
	}
	return sum % 10 === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(bloc: string, where: string, obj: Record<string, unknown>, key: string): string | null {
	const value = obj[key];
	if (typeof value !== "string" || value.trim().length === 0) {
		err(bloc, where, `champ « ${key} » absent ou vide`);
		return null;
	}
	return value;
}

function checkDept(bloc: string, where: string, dept: unknown): void {
	if (typeof dept !== "string" || !DEPTS_NA.has(dept)) {
		err(bloc, where, `département « ${String(dept)} » hors Nouvelle-Aquitaine`);
	}
}

function checkCommune(bloc: string, where: string, code: unknown, dept: unknown, communes: Map<string, string>): void {
	if (code === null || code === undefined) {
		warn(bloc, where, "code commune absent — l'entité ne sera pas géolocalisable finement");
		return;
	}
	if (typeof code !== "string" || !/^[0-9AB]\d{4}$/.test(code)) {
		err(bloc, where, `code INSEE « ${String(code)} » mal formé (5 caractères attendus)`);
		return;
	}
	const expected = communes.get(code);
	if (!expected) {
		warn(bloc, where, `code INSEE ${code} absent du jeu versionné (commune nouvelle ou fusion ?)`);
	} else if (typeof dept === "string" && expected !== dept) {
		err(bloc, where, `code INSEE ${code} appartient au ${expected}, pas au ${dept}`);
	}
}

function checkCoords(bloc: string, where: string, lat: unknown, lon: unknown): void {
	if (lat === null || lat === undefined || lon === null || lon === undefined) return;
	if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
		err(bloc, where, "coordonnées non numériques");
		return;
	}
	// Bornes larges de la région : un point hors cadre est une erreur de source.
	if (lat < 42.5 || lat > 47.5 || lon < -2.5 || lon > 1.5) {
		warn(bloc, where, `coordonnées (${lat}, ${lon}) hors du cadre Nouvelle-Aquitaine`);
	}
}

function checkUrl(bloc: string, where: string, value: unknown, required: boolean): void {
	if (value === null || value === undefined || value === "") {
		if (required) err(bloc, where, "URL absente");
		return;
	}
	if (typeof value !== "string") { err(bloc, where, "URL non textuelle"); return; }
	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("schéma");
	} catch {
		err(bloc, where, `URL invalide : ${String(value).slice(0, 80)}`);
	}
}

function checkDate(bloc: string, where: string, value: unknown, key: string, required: boolean): void {
	if (value === null || value === undefined) {
		if (required) err(bloc, where, `date « ${key} » absente`);
		return;
	}
	if (typeof value !== "string" || !ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) {
		err(bloc, where, `date « ${key} » non ISO (AAAA-MM-DD attendu) : ${String(value).slice(0, 40)}`);
	}
}

/** Méta de provenance : sans elle, la donnée n'est pas auditable. */
function checkMeta(bloc: string, data: Record<string, unknown>): void {
	const meta = data.meta;
	if (!isRecord(meta)) { err(bloc, "meta", "bloc « meta » absent"); return; }
	requireString(bloc, "meta", meta, "titre");
	checkDate(bloc, "meta", meta.genereLe, "genereLe", true);
	requireString(bloc, "meta", meta, "methode");
	const sources = meta.sources;
	if (!Array.isArray(sources) || sources.length === 0) {
		err(bloc, "meta.sources", "aucune source déclarée");
		return;
	}
	sources.forEach((source, i) => {
		const where = `meta.sources[${i}]`;
		if (!isRecord(source)) { err(bloc, where, "entrée non objet"); return; }
		requireString(bloc, where, source, "nom");
		requireString(bloc, where, source, "licence");
		checkUrl(bloc, where, source.url, true);
	});
}

function rows(data: unknown, key: string, bloc: string): Record<string, unknown>[] {
	if (!isRecord(data)) { err(bloc, "racine", "le fichier doit contenir un objet"); return []; }
	checkMeta(bloc, data);
	const list = data[key];
	if (!Array.isArray(list)) { err(bloc, "racine", `clé « ${key} » absente ou non tableau`); return []; }
	counts.set(bloc, list.length);
	if (list.length === 0) warn(bloc, "racine", "aucun enregistrement");
	return list.filter((row): row is Record<string, unknown> => {
		if (isRecord(row)) return true;
		err(bloc, "ligne", "enregistrement non objet");
		return false;
	});
}

function validateEntreprises(communes: Map<string, string>): void {
	const bloc = "entreprises";
	const data = loadJson("db/data/entreprises-na.json");
	if (data === null) { warn(bloc, "fichier", "db/data/entreprises-na.json absent"); return; }
	const seen = new Set<string>();
	for (const [i, row] of rows(data, "entreprises", bloc).entries()) {
		const where = `entreprises[${i}]`;
		const siren = requireString(bloc, where, row, "siren");
		if (siren !== null) {
			if (!validSiren(siren)) err(bloc, where, `SIREN ${siren} invalide (clé de Luhn)`);
			if (seen.has(siren)) err(bloc, where, `SIREN ${siren} en doublon`);
			seen.add(siren);
		}
		requireString(bloc, where, row, "nom");
		const naf = row.naf;
		if (typeof naf !== "string" || !NAF.test(naf)) err(bloc, where, `code NAF mal formé : ${String(naf)}`);
		if (row.etat !== "actif" && row.etat !== "cesse") err(bloc, where, `état « ${String(row.etat)} » (actif|cesse attendu)`);
		const siege = row.siege;
		if (!isRecord(siege)) { err(bloc, where, "bloc « siege » absent"); continue; }
		checkDept(bloc, where, siege.departement);
		checkCommune(bloc, where, siege.codeCommune, siege.departement, communes);
		checkCoords(bloc, where, siege.lat, siege.lon);
		checkUrl(bloc, where, row.siteWeb, false);
	}
}

function validateEtablissements(bloc: string, file: string, idKey: "finess" | "uai", communes: Map<string, string>): void {
	const data = loadJson(file);
	if (data === null) { warn(bloc, "fichier", `${file} absent`); return; }
	const seen = new Set<string>();
	for (const [i, row] of rows(data, "etablissements", bloc).entries()) {
		const where = `etablissements[${i}]`;
		const id = requireString(bloc, where, row, idKey);
		if (id !== null) {
			const shape = idKey === "finess" ? /^\d{9}$/ : /^\d{7}[A-Z]$/;
			if (!shape.test(id)) err(bloc, where, `${idKey} « ${id} » mal formé (${idKey === "finess" ? "9 chiffres" : "7 chiffres + 1 lettre"})`);
			if (seen.has(id)) err(bloc, where, `${idKey} ${id} en doublon`);
			seen.add(id);
		}
		requireString(bloc, where, row, "nom");
		requireString(bloc, where, row, "type");
		checkDept(bloc, where, row.departement);
		checkCommune(bloc, where, row.codeCommune, row.departement, communes);
		checkCoords(bloc, where, row.lat, row.lon);
		checkUrl(bloc, where, row.siteWeb, false);
	}
}

function validateCorpus(): void {
	const bloc = "corpus";
	const data = loadJson("bench/fixtures/corpus-temoin-na.json");
	if (data === null) { warn(bloc, "fichier", "bench/fixtures/corpus-temoin-na.json absent"); return; }
	const seen = new Set<string>();
	const seenUrls = new Map<string, number>();
	// Périmètre : un incident national dont on retient « des membres régionaux »
	// n'est pas un incident NA. Sans marque structurée, la nuance ne vit que
	// dans la prose et le calcul de couverture compte faux.
	const PERIMETRES = new Set(["siege-na", "impact-na", "national"]);
	let dansFenetre = 0;
	let horsFenetre = 0;
	let sansPerimetre = 0;
	const fenetre = isRecord(data) && isRecord(data.meta) ? data.meta.fenetre : null;
	const bornes = Array.isArray(fenetre) && fenetre.length === 2 && fenetre.every((x) => typeof x === "string")
		? (fenetre as [string, string])
		: null;
	const TYPES = new Set(["ransomware", "fuite", "ddos", "defacement", "phishing", "compromission", "autre"]);
	const CONFIANCE = new Set(["etabli", "rapporte", "declare"]);
	const ENTITES = new Set(["collectivite", "sante", "enseignement", "entreprise", "autre"]);
	for (const [i, row] of rows(data, "incidents", bloc).entries()) {
		const where = `incidents[${i}]`;
		const id = requireString(bloc, where, row, "id");
		if (id !== null) {
			if (seen.has(id)) err(bloc, where, `identifiant ${id} en doublon`);
			seen.add(id);
		}
		requireString(bloc, where, row, "entite");
		requireString(bloc, where, row, "resume");
		// Le type d'entité décide à quel référentiel l'incident sera comparé :
		// sans lui, la mesure de couverture ne peut pas classer le cas.
		if (typeof row.entiteType !== "string" || !ENTITES.has(row.entiteType)) {
			err(bloc, where, `type d'entité inconnu : ${String(row.entiteType)}`);
		}
		checkDept(bloc, where, row.departement);
		checkDate(bloc, where, row.datePublique, "datePublique", true);
		checkDate(bloc, where, row.dateIncident, "dateIncident", false);
		// L'appartenance à la fenêtre se CALCULE, elle ne se déclare pas : un
		// compte rendu peut annoncer 15, 16 ou 4 hors fenêtre, seul l'arithmétique
		// tranche. Constaté sur la première livraison : trois chiffres différents.
		if (bornes && typeof row.datePublique === "string") {
			if (row.datePublique >= bornes[0] && row.datePublique <= bornes[1]) dansFenetre++;
			else {
				horsFenetre++;
				warn(bloc, where, `hors fenêtre (${row.datePublique}) — à exclure du comptage de couverture`);
			}
		}
		if (row.perimetre === undefined) {
			sansPerimetre++;
		} else if (typeof row.perimetre !== "string" || !PERIMETRES.has(row.perimetre)) {
			err(bloc, where, `périmètre « ${String(row.perimetre)} » (siege-na|impact-na|national attendu)`);
		} else if (row.perimetre === "national") {
			warn(bloc, where, "périmètre national — ne doit pas entrer dans le dénominateur NA");
		}
		if (typeof row.dateIncident === "string" && typeof row.datePublique === "string" && row.dateIncident > row.datePublique) {
			warn(bloc, where, "date d'incident postérieure à la date de publication");
		}
		if (typeof row.type !== "string" || !TYPES.has(row.type)) err(bloc, where, `type d'incident inconnu : ${String(row.type)}`);
		if (typeof row.confiance !== "string" || !CONFIANCE.has(row.confiance)) {
			err(bloc, where, `confiance « ${String(row.confiance)} » (etabli|rapporte|declare attendu)`);
		}
		const preuve = row.preuve;
		if (!isRecord(preuve)) { err(bloc, where, "bloc « preuve » absent — un incident sans source n'est pas une vérité terrain"); continue; }
		checkUrl(bloc, where, preuve.url, true);
		requireString(bloc, where, preuve, "editeur");
		const extrait = preuve.extrait;
		if (typeof extrait !== "string" || extrait.trim().length < 20) {
			err(bloc, where, "extrait absent ou trop court — impossible de vérifier sans citation");
		} else if (extrait.length > 600) {
			warn(bloc, where, "extrait long : garder une citation courte, pas un article entier");
		}
		if (typeof preuve.url === "string") seenUrls.set(preuve.url, (seenUrls.get(preuve.url) ?? 0) + 1);
	}
	for (const [url, n] of seenUrls) {
		if (n > 3) warn(bloc, "preuve.url", `${n} incidents pointent sur ${url} — vérifier qu'il ne s'agit pas d'un article fourre-tout`);
	}
	if (bornes) {
		console.log(`\nCorpus — fenêtre ${bornes[0]} → ${bornes[1]} : ${dansFenetre} dedans, ${horsFenetre} hors fenêtre (calculé sur datePublique)`);
	}
	if (sansPerimetre > 0) {
		warn(bloc, "perimetre", `${sansPerimetre} incident(s) sans périmètre structuré : impossible de distinguer une victime NA d'un incident national à impact régional`);
	}
}

function validateSources(): void {
	const bloc = "sources";
	const data = loadJson("bench/results/sources-probe.json");
	if (data === null) { warn(bloc, "fichier", "bench/results/sources-probe.json absent"); return; }
	const VERDICTS = new Set(["vivant", "vide", "mort", "bloque"]);
	for (const [i, row] of rows(data, "sources", bloc).entries()) {
		const where = `sources[${i}]`;
		requireString(bloc, where, row, "id");
		checkUrl(bloc, where, row.url, true);
		if (typeof row.httpStatus !== "number") err(bloc, where, "httpStatus non numérique (0 si injoignable)");
		if (typeof row.verdict !== "string" || !VERDICTS.has(row.verdict)) {
			err(bloc, where, `verdict « ${String(row.verdict)} » (vivant|vide|mort|bloque attendu)`);
		}
		if (row.verdict === "vivant") {
			if (typeof row.itemsVus !== "number" || row.itemsVus <= 0) err(bloc, where, "verdict « vivant » sans itemsVus > 0");
			if (!Array.isArray(row.exemplesTitres) || row.exemplesTitres.length === 0) {
				err(bloc, where, "verdict « vivant » sans exemple de titre — invérifiable");
			}
		}
		checkDate(bloc, where, row.dernierItemLe, "dernierItemLe", false);
	}
}

function main(): void {
	console.log(`Validation des données externes — ${BASE}`);
	const manifest = ["docs/research/collecte-externe.md", "docs/research/collecte-externe.json"];
	const hasManifest = manifest.some((f) => existsSync(join(BASE, f)));
	if (!hasManifest) {
		const message = "aucun compte rendu de collecte (docs/research/collecte-externe.md) — méthode et limites non documentées";
		if (FINAL) err("manifest", "racine", message);
		else warn("manifest", "racine", message);
	}

	const delivered = EXPECTED.filter((f) => existsSync(join(BASE, f)));
	console.log(`Fichiers de données livrés : ${delivered.length}/${EXPECTED.length}`);
	for (const file of delivered) console.log(`  présent  ${file}`);
	const communes = knownCommunes();
	if (communes.size === 0) err("socle", "db/data/referentiel-na.json", "référentiel versionné illisible : impossible de contrôler les codes INSEE");
	else console.log(`Codes INSEE de référence : ${communes.size}`);

	if (ONLY === "all" || ONLY === "entreprises") validateEntreprises(communes);
	if (ONLY === "all" || ONLY === "sante") validateEtablissements("sante", "db/data/sante-na.json", "finess", communes);
	if (ONLY === "all" || ONLY === "enseignement") validateEtablissements("enseignement", "db/data/enseignement-na.json", "uai", communes);
	if (ONLY === "all" || ONLY === "corpus") validateCorpus();
	if (ONLY === "all" || ONLY === "sources") validateSources();

	console.log("");
	for (const [bloc, n] of counts) console.log(`${bloc.padEnd(14)} ${n} enregistrement(s)`);

	// Le cœur du correctif : sans donnée, il n'y a rien de conforme. On le dit
	// explicitement, sinon « 0 erreur » se lit comme une réussite.
	const totalRows = [...counts.values()].reduce((total, n) => total + n, 0);
	if (ONLY === "all" && delivered.length === 0) {
		err("livraison", "racine", "aucun fichier de données livré — la validation est sans objet, ce n'est pas une réussite");
	} else if (totalRows === 0) {
		err("livraison", "racine", "aucun enregistrement dans les fichiers livrés");
	}
	if (FINAL && ONLY === "all" && !counts.has("corpus")) {
		err("livraison", "corpus", "bloc 1 absent : sans corpus d'incidents, la couverture reste non mesurable");
	}

	const errors = issues.filter((i) => i.level === "erreur");
	const warnings = issues.filter((i) => i.level === "avertissement");
	console.log(`\n${errors.length} erreur(s), ${warnings.length} avertissement(s)`);
	for (const issue of issues.slice(0, 60)) {
		console.log(`  [${issue.level}] ${issue.bloc} ${issue.where} — ${issue.message}`);
	}
	if (issues.length > 60) console.log(`  … ${issues.length - 60} autre(s), voir le détail complet en relançant par bloc`);
	if (errors.length > 0) {
		console.log("\nDonnées NON chargeables en l'état : corriger les erreurs, ou documenter l'écart dans le compte rendu.");
		process.exitCode = 1;
	} else {
		console.log(`\nStructure conforme sur ${totalRows} enregistrement(s) réparti(s) dans ${delivered.length} fichier(s).`);
		console.log("Reste à relire les avertissements avant chargement.");
		if (!FINAL) console.log("Contrôle final : relancer avec --livraison (exige le compte rendu et le bloc 1).");
	}
}

main();
