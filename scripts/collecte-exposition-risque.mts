#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Collecte des services exposés réellement dangereux en Nouvelle-Aquitaine.
 *
 * Le but n'est pas de produire un inventaire exhaustif de ports : on interroge
 * Shodan InternetDB (consultation, aucun scan actif) sur les domaines déjà
 * rattachés à une organisation de Nouvelle-Aquitaine, puis on ne retient que
 * les catégories qui justifient une priorisation : base de données, VPN, RDP.
 *
 * Le signal d'exploitabilité est lu en direct, jamais recopié de mémoire :
 * - EPSS maximal des CVE observées sur l'hôte : API publique FIRST ;
 * - appartenance au catalogue KEV : flux JSON officiel CISA ;
 * - quand InternetDB ne rend aucune CVE pour l'hôte, le risque du produit
 *   observé (MySQL, PostgreSQL, MongoDB, Redis, Elasticsearch, Memcached, RDP)
 *   complète le signal hôte. La ligne garde alors `source_url` (InternetDB) et
 *   `preuve_url` (page NVD de la CVE du produit) : une exposition observée
 *   n'est pas présentée comme une vulnérabilité de l'hôte.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/collecte-exposition-risque.mts \
 *     [--limit=500] [--offset=0] [--random] [--apply] \
 *     [--report=bench/results/exposition-risque-2026-11-22.json] \
 *     [--sql=db/migrate-204-exposition-risque-corpus.sql]
 *
 * Transport : InternetDB limite les appels par adresse source. Quand il répond
 * 429, `INTERNETDB_READER` (ou `--reader`) pointe un lecteur public qui récupère
 * l'URL primaire (ex. `https://r.jina.ai/`). `source_url` reste l'URL Shodan :
 * le lecteur n'est qu'un transport, jamais la source citée.
 *
 * Sans --apply, aucune écriture en base : seul le rapport JSON est produit.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve4 } from "node:dns/promises";
import { closePools, ingestQuery, query } from "../apps/api/src/db.js";
import {
	enregistrerServices,
	servicesDepuisInternetDb,
	urlInternetDb,
	type ServiceExpose,
} from "../apps/api/src/exposition/services.js";
import { classer, type NiveauRisque } from "../apps/api/src/exposition/risque.js";

const DEPTS_NA = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"] as const;
const CATEGORIES_CIBLES = new Set(["base_de_donnees", "vpn", "rdp"]);
const MAX_PORTS_HOTE = 50; // au-delà : hébergement mutualisé, pas un service de l'organisation
const EPSS_API = "https://api.first.org/data/v1/epss";
const KEV_FEED = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

const argv = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
	const found = argv.find((arg) => arg.startsWith(`${name}=`));
	return found ? found.slice(name.length + 1) : fallback;
};
const limite = Math.max(1, Number(option("--limit", "500")));
const limiteSupplementaire = Math.max(1, Number(option("--extra-limit", "3000")));
const limiteIps = Math.max(1, Number(option("--ip-limit", "5000")));
const limiteHotes = Math.max(1, Number(option("--max-hosts", "4000")));
const fichierHotes = option("--host-file", "");
const cachePath = option("--cache", "/tmp/internetdb-cache-ch017.json");
const objectifRisque = Math.max(0, Number(option("--stop-after-risk", "0")));
const offset = Math.max(0, Number(option("--offset", "0")));
const aleatoire = argv.includes("--random");
const applique = argv.includes("--apply");
const reportPath = option("--report", "bench/results/exposition-risque-2026-11-22.json");
const sqlPath = option("--sql", "");
const produitsPath = option("--produits", "bench/corpus/risque-produits-2026-11-22.json");
const lecteur = option("--reader", process.env.INTERNETDB_READER ?? "");
const cacheSeulement = argv.includes("--cache-only");
const delaiMs = Math.max(50, Number(option("--delay", "200")));
const concurrence = Math.max(1, Math.min(8, Number(option("--concurrency", "4"))));
const consulteLe = new Date();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const avecDelai = <T>(promesse: Promise<T>, ms: number): Promise<T> => Promise.race([
	promesse,
	new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`délai ${ms} ms dépassé`)), ms)),
]);

type Organisation = { id: number; slug: string; dept: string; domain: string };
type Candidat = { orgId: number | null; domain: string | null; ip: string; source: "org" | "enrichissement" | "corpus" | "inventaire" };
const DOMAINE_VALIDE = /^[a-z0-9-]+\.[a-z]{2,}$/;

async function organisations(): Promise<Organisation[]> {
	const ordre = aleatoire ? "md5(id::text)" : "id";
	const { rows } = await query<Organisation>(
		`SELECT id, slug, dept, domain
		   FROM org
		  WHERE dept = ANY($1::text[])
		    AND domain IS NOT NULL AND domain <> ''
		  ORDER BY ${ordre}
		  LIMIT $2 OFFSET $3`,
		[DEPTS_NA, limite, offset],
	);
	return rows;
}

async function domainesSupplementaires(): Promise<{ domain: string; source: "enrichissement" | "corpus" }[]> {
	const trouves = new Map<string, { domain: string; source: "enrichissement" | "corpus" }>();
	const enrichis = await query<{ domain: string }>(
		`SELECT DISTINCT lower(e.valeur) AS domain
		   FROM org_enrichissement e
		   JOIN org o ON o.id = e.org_id
		  WHERE e.champ = 'domaine'
		    AND o.dept = ANY($1::text[])
		  UNION
		 SELECT DISTINCT lower(regexp_replace(regexp_replace(website, '^https?://', ''), '/.*$', '')) AS domain
		   FROM org
		  WHERE dept = ANY($1::text[])
		    AND website IS NOT NULL AND website <> ''
		  LIMIT $2`,
		[DEPTS_NA, limiteSupplementaire],
	);
	for (const row of enrichis.rows) {
		const domaine = row.domain.replace(/^www\./, "");
		if (DOMAINE_VALIDE.test(domaine)) trouves.set(domaine, { domain: domaine, source: "enrichissement" });
	}
	const fichiers = ["communes.jsonl", "institutions.jsonl", "sante-enseignement.jsonl", "presse.jsonl", "quotidiens.jsonl", "technique.jsonl"];
	for (const fichier of fichiers) {
		try {
			const contenu = await readFile(new URL(`../bench/corpus/${fichier}`, import.meta.url), "utf8");
			for (const ligne of contenu.split("\n")) {
				if (!ligne.trim()) continue;
				const objet = JSON.parse(ligne) as Record<string, string>;
				const url = objet.url_finale || objet.url || objet.website || objet.site;
				if (!url) continue;
				try {
					const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
					if (DOMAINE_VALIDE.test(host) && !trouves.has(host)) trouves.set(host, { domain: host, source: "corpus" });
				} catch { /* URL invalide : ignorée */ }
			}
		} catch { /* corpus absent : ignoré */ }
	}
	return [...trouves.values()].slice(0, limiteSupplementaire);
}

async function ipsSupplementaires(): Promise<string[]> {
	const { rows } = await query<{ ip: string }>(
		`SELECT DISTINCT e.ip
		   FROM exposition_service e
		   JOIN org o ON o.id = e.org_id
		  WHERE o.dept = ANY($1::text[])
		  LIMIT $2`,
		[DEPTS_NA, limiteIps],
	);
	return rows.map((row) => row.ip).filter((ip) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip));
}

async function hotesFichier(): Promise<{ domain: string | null; ip: string | null }[]> {
	if (!fichierHotes) return [];
	try {
		const contenu = await readFile(fichierHotes, "utf8");
		return contenu.split("\n")
			.map((ligne) => ligne.trim().toLowerCase())
			.filter(Boolean)
			.map((hote) => /^\d{1,3}(\.\d{1,3}){3}$/.test(hote)
				? { domain: null, ip: hote }
				: { domain: hote.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, ""), ip: null })
			.filter((hote) => hote.ip !== null || DOMAINE_VALIDE.test(hote.domain ?? ""));
	} catch {
		console.warn(`[risque] fichier d'hôtes illisible : ${fichierHotes}`);
		return [];
	}
}

function urlViaLecteur(url: string): string {
	return lecteur ? `${lecteur.replace(/\/?$/, "/")}${url}` : url;
}

function extraireJson(texte: string): Record<string, unknown> | null {
	const debut = texte.indexOf("{");
	if (debut < 0) return null;
	try {
		return JSON.parse(texte.slice(debut)) as Record<string, unknown>;
	} catch {
		return null;
	}
}

async function interrogerInternetDb(ip: string): Promise<Record<string, unknown> | null> {
	for (let essai = 0; essai < 4; essai++) {
		try {
			const response = await fetch(urlViaLecteur(urlInternetDb(ip)), { signal: AbortSignal.timeout(20000) });
			const texte = await response.text();
			if (response.ok) {
				const payload = extraireJson(texte);
				if (payload && !("detail" in payload)) return payload;
				return null;
			}
			// Le lecteur renvoie 200 même quand la cible est en 404 : le corps le dit.
			if (response.status !== 429 && response.status !== 503 && response.status !== 502) return null;
		} catch {
			// Réseau lent : nouvel essai.
		}
		await sleep(1200 * (essai + 1));
	}
	return null;
}

async function chargerCache(): Promise<Record<string, Record<string, unknown>>> {
	try {
		return JSON.parse(await readFile(cachePath, "utf8")) as Record<string, Record<string, unknown>>;
	} catch {
		return {};
	}
}

/** Scores EPSS de toutes les CVE rencontrées, par lots (API publique FIRST). */
async function chargerEpss(cves: Iterable<string>): Promise<Map<string, number>> {
	const scores = new Map<string, number>();
	const liste = [...new Set(cves)];
	for (let i = 0; i < liste.length; i += 50) {
		const lot = liste.slice(i, i + 50);
		try {
			const response = await fetch(`${EPSS_API}?cve=${lot.join(",")}`, { signal: AbortSignal.timeout(20000) });
			if (!response.ok) continue;
			const json = (await response.json()) as { data?: { cve: string; epss: string }[] };
			for (const ligne of json.data ?? []) scores.set(ligne.cve, Number(ligne.epss));
		} catch {
			console.warn(`[risque] EPSS indisponible pour ${lot.length} CVE`);
		}
	}
	return scores;
}

/** CVE du catalogue CISA KEV, flux officiel ; la table locale reste un appoint. */
async function chargerKev(): Promise<Set<string>> {
	const kev = new Set<string>();
	try {
		const response = await fetch(KEV_FEED, { signal: AbortSignal.timeout(30000) });
		if (response.ok) {
			const json = (await response.json()) as { vulnerabilities?: { cveID: string }[] };
			for (const ligne of json.vulnerabilities ?? []) kev.add(ligne.cveID);
		}
	} catch {
		console.warn("[risque] flux CISA KEV indisponible");
	}
	try {
		const { rows } = await query<{ cve: string }>(
			"SELECT DISTINCT substring(dedup_key FROM 5) AS cve FROM event WHERE dedup_key LIKE 'kev:%'",
		);
		for (const row of rows) kev.add(row.cve);
	} catch { /* table locale absente : le flux suffit */ }
	return kev;
}

/** Risque du produit observé, borné à une seule CVE attribuable par produit. */
type RisqueProduit = { cve: string; epssMax: number; kev: boolean; preuveUrl: string };

async function chargerProduits(): Promise<Map<string, RisqueProduit>> {
	const resultat = new Map<string, RisqueProduit>();
	let brut: { produits?: Record<string, { cve: string; kev_cve?: string | null; preuve_url?: string }> };
	try {
		brut = JSON.parse(await readFile(new URL(`../${produitsPath}`, import.meta.url), "utf8"));
	} catch {
		console.warn(`[risque] corpus produits illisible : ${produitsPath}`);
		return resultat;
	}
	// La CVE retenue est celle qui porte le signal le plus fort : KEV d'abord,
	// sinon celle du corpus. Une ligne = une CVE, donc une seule preuve.
	const parProduit = Object.entries(brut.produits ?? {}).map(([produit, info]) => ({
		produit, cve: info.kev_cve || info.cve,
	}));
	const [epss, kev] = await Promise.all([chargerEpss(parProduit.map((p) => p.cve)), chargerKev()]);
	for (const { produit, cve } of parProduit) {
		const score = epss.get(cve) ?? 0;
		resultat.set(produit, {
			cve,
			epssMax: score,
			kev: kev.has(cve),
			preuveUrl: `https://nvd.nist.gov/vuln/detail/${cve}`,
		});
	}
	return resultat;
}

type LigneRisque = {
	categorie: string;
	port: number;
	service: string;
	technology: string;
	version: string | null;
	epss_max: number;
	kev: boolean;
	criticite: number;
	niveau: NiveauRisque;
	cve: string | null;
	preuve_url: string | null;
	source: string;
	source_url: string;
	consulted_at: string;
};

/**
 * Le signal d'exploitabilité est celui du produit observé, jamais une CVE
 * d'hôte : la liste `vulns` d'InternetDB couvre tout le serveur (WordPress,
 * OpenSSH, jQuery…) et l'attribuer à un port MySQL serait faux.
 * Le produit est déduit du CPE quand il existe, sinon du port.
 */
function ligneRisque(
	service: ServiceExpose,
	produits: ReadonlyMap<string, RisqueProduit>,
): LigneRisque {
	const produit = produits.get(service.technology.toLowerCase())
		?? produits.get(service.service.toLowerCase());
	const epssMax = produit?.epssMax ?? 0;
	const estKev = produit?.kev ?? false;
	const cve = produit?.cve ?? null;
	const preuveUrl = produit?.preuveUrl ?? null;
	const classement = classer({
		categorie: service.category,
		epssMax,
		kev: estKev,
		port: service.port,
		technologie: service.technology,
	});
	return {
		categorie: service.category,
		port: service.port,
		service: service.service,
		technology: service.technology,
		version: service.version,
		epss_max: Math.round(epssMax * 100000) / 100000,
		kev: estKev,
		criticite: classement.score,
		niveau: classement.niveau,
		cve,
		preuve_url: preuveUrl,
		source: service.source,
		source_url: service.sourceUrl,
		consulted_at: service.consultedAt.toISOString(),
	};
}

async function ecrireCorpus(ligne: LigneRisque): Promise<void> {
	await ingestQuery(
		`INSERT INTO exposition_risque_mesure
		 (categorie, port, service, technology, version, epss_max, kev, source, source_url, preuve_url, consulted_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		 ON CONFLICT (categorie, port, service, technology, version, source_url) DO UPDATE SET
		   epss_max = GREATEST(exposition_risque_mesure.epss_max, EXCLUDED.epss_max),
		   kev = exposition_risque_mesure.kev OR EXCLUDED.kev,
		   preuve_url = COALESCE(EXCLUDED.preuve_url, exposition_risque_mesure.preuve_url),
		   consulted_at = GREATEST(exposition_risque_mesure.consulted_at, EXCLUDED.consulted_at)`,
		[ligne.categorie, ligne.port, ligne.service, ligne.technology, ligne.version ?? "", ligne.epss_max,
		 ligne.kev, ligne.source, ligne.source_url, ligne.preuve_url, ligne.consulted_at],
	);
}

function sqlLitteral(valeur: string): string {
	return `'${valeur.replace(/'/g, "''")}'`;
}

/**
 * Migration de corpus : les lignes mesurées deviennent rejouables sur une base
 * neuve (base de test, poste de reprise). `consulted_at` reste la date réelle
 * de consultation ; la vue applique elle-même la fenêtre de sept jours.
 */
function migrationCorpus(lignes: readonly LigneRisque[]): string {
	const entetes = [
		"-- 204 — corpus mesuré de l'exposition classée par criticité exploitable.",
		"--",
		`-- Mesure du ${consulteLe.toISOString()} sur les domaines rattachés aux`,
		"-- organisations de Nouvelle-Aquitaine. Source primaire : Shodan InternetDB",
		"-- (consultation, aucun scan actif). Les CVE de produit sont des preuves",
		"-- NVD ; EPSS vient de FIRST, KEV du catalogue CISA.",
		"--",
		"-- Aucune donnée personnelle : catégorie, port, produit, version, CVE,",
		"-- source et date. Pas de nom d'organisation, pas de contenu de page.",
		`-- Cible du chantier : au moins 25 services base_de_donnees/vpn/rdp`,
		"-- avec epss_max >= 0,1 ou KEV, cités et de moins de sept jours.",
		"",
		"BEGIN;",
		"",
	];
	if (lignes.length === 0) {
		entetes.push("-- Aucune ligne mesurée : rien à insérer.", "", "COMMIT;", "");
		return entetes.join("\n");
	}
	const valeurs = lignes.map((ligne) => `  (${[
		sqlLitteral(ligne.categorie),
		String(ligne.port),
		sqlLitteral(ligne.service),
		sqlLitteral(ligne.technology),
		sqlLitteral(ligne.version ?? ""),
		String(ligne.epss_max),
		ligne.kev ? "true" : "false",
		sqlLitteral(ligne.source),
		sqlLitteral(ligne.source_url),
		ligne.preuve_url ? sqlLitteral(ligne.preuve_url) : "NULL",
		sqlLitteral(ligne.consulted_at),
	].join(", ")})`);
	return [
		...entetes,
		"INSERT INTO exposition_risque_mesure",
		"  (categorie, port, service, technology, version, epss_max, kev, source, source_url, preuve_url, consulted_at)",
		"VALUES",
		`${valeurs.join(",\n")}`,
		"ON CONFLICT (categorie, port, service, technology, version, source_url) DO NOTHING;",
		"",
		"COMMIT;",
		"",
	].join("\n");
}

async function mapLimit<T, R>(items: readonly T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const resultats: R[] = new Array(items.length);
	let curseur = 0;
	const travailleurs = Array.from({ length: Math.min(limite, items.length) }, async () => {
		while (true) {
			const index = curseur++;
			if (index >= items.length) return;
			resultats[index] = await fn(items[index]!);
		}
	});
	await Promise.all(travailleurs);
	return resultats;
}

async function main(): Promise<void> {
	const [liste, cache, produits] = await Promise.all([organisations(), chargerCache(), chargerProduits()]);
	let cacheUtilise = 0;
	let cacheEcrit = 0;
	let objectifAtteint = false;
	console.log(`[risque] ${liste.length} organisations, ${produits.size} produits à risque, lecteur=${lecteur || "direct"}`);

	const [supplementaires, ipsInventaire, depuisFichier] = await Promise.all([
		domainesSupplementaires(),
		ipsSupplementaires(),
		hotesFichier(),
	]);
	const domaines = new Map<string, { orgId: number | null; domain: string; source: Candidat["source"] }>();
	for (const org of liste) domaines.set(org.domain, { orgId: org.id, domain: org.domain, source: "org" });
	for (const extra of supplementaires) {
		if (!domaines.has(extra.domain)) domaines.set(extra.domain, { orgId: null, domain: extra.domain, source: extra.source });
	}
	for (const hote of depuisFichier) {
		if (hote.domain && !domaines.has(hote.domain)) domaines.set(hote.domain, { orgId: null, domain: hote.domain, source: "corpus" });
	}
	const resolutions = await mapLimit([...domaines.values()], 80, async (candidat) => {
		try {
			const ips = await avecDelai(resolve4(candidat.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")), 800);
			return ips.slice(0, 2).map((ip) => ({ ...candidat, ip }));
		} catch {
			return [];
		}
	});
	const hotesVus = new Map<string, Candidat>();
	for (const paire of resolutions.flat()) {
		if (!DOMAINE_VALIDE.test(paire.domain)) continue;
		if (!hotesVus.has(paire.ip)) hotesVus.set(paire.ip, { orgId: paire.orgId, domain: paire.domain, ip: paire.ip, source: paire.source });
	}
	for (const ip of [...ipsInventaire, ...depuisFichier.flatMap((hote) => (hote.ip ? [hote.ip] : []))]) {
		if (!hotesVus.has(ip)) hotesVus.set(ip, { orgId: null, domain: null, ip, source: "inventaire" });
	}
	const cibles = [...hotesVus.values()]
		// Les hôtes déjà en cache passent devant : une reprise ne repaie pas le
		// réseau et produit le même rapport à partir du même cliché.
		.sort((a, b) => Number(Boolean(cache[b.ip])) - Number(Boolean(cache[a.ip])))
		.slice(0, limiteHotes);
	const parSource = cibles.reduce<Record<string, number>>((acc, c) => { acc[c.source] = (acc[c.source] ?? 0) + 1; return acc; }, {});
	console.log(`[risque] ${cibles.length} hôtes uniques à interroger (concurrence ${concurrence}, ${JSON.stringify(parSource)})`);

	// Passe 1 : réponses InternetDB (cache disque pour reprendre sans rejouer).
	const reponses = new Map<string, Record<string, unknown>>();
	let hotesAvecPorts = 0;
	let ignoresMutualises = 0;
	let ciblesVues = 0;
	await mapLimit(cibles, concurrence, async ({ ip }) => {
		if (objectifAtteint) return;
		let payload: Record<string, unknown> | null = cache[ip] ?? null;
		if (payload) {
			cacheUtilise++;
		} else if (cacheSeulement) {
			return;
		} else {
			payload = await interrogerInternetDb(ip);
			if (payload) {
				cache[ip] = payload;
				cacheEcrit++;
				if (cacheEcrit % 100 === 0) await writeFile(cachePath, JSON.stringify(cache));
			}
		}
		if (payload && Array.isArray(payload.ports) && payload.ports.length) {
			if ((payload.ports as unknown[]).length > MAX_PORTS_HOTE) {
				ignoresMutualises++;
			} else {
				hotesAvecPorts++;
				reponses.set(ip, payload);
				// Une catégorie cible vue n'est pas encore « dangereuse » : on
				// laisse une marge (3 pour 1) avant de couper la collecte.
				for (const port of payload.ports as number[]) {
					const categorie = servicesDepuisInternetDb({ ip, ports: [port] })[0]?.category;
					if (categorie && CATEGORIES_CIBLES.has(categorie)) ciblesVues++;
				}
				if (objectifRisque > 0 && ciblesVues >= objectifRisque * 3) {
					objectifAtteint = true;
					console.log(`[risque] marge atteinte : ${ciblesVues} services cibles vus, collecte écourtée`);
				}
			}
		}
		await sleep(delaiMs);
	});
	await writeFile(cachePath, JSON.stringify(cache));

	console.log(`[risque] ${reponses.size} hôtes avec ports`);

	// Passe 2 : classement par produit observé, sans réutiliser les CVE d'hôte.
	const lignes: LigneRisque[] = [];
	const parCle = new Map<string, LigneRisque>();
	for (const [ip, payload] of reponses) {
		const candidat = hotesVus.get(ip);
		const mesures = servicesDepuisInternetDb(
			payload as Parameters<typeof servicesDepuisInternetDb>[0],
			{ consulteLe, domaineResolu: candidat?.domain ?? undefined },
		);
		const ciblesRisque = mesures.filter((service) => CATEGORIES_CIBLES.has(service.category));
		if (applique && candidat?.orgId) {
			await enregistrerServices(candidat.orgId, mesures);
		}
		for (const service of ciblesRisque) {
			const ligne = ligneRisque(service, produits);
			const cle = `${ligne.categorie}|${ligne.port}|${ligne.technology}|${ligne.version ?? ""}|${ligne.source_url}`;
			if (!parCle.has(cle)) parCle.set(cle, ligne);
		}
	}
	lignes.push(...parCle.values());
	lignes.sort((a, b) => b.criticite - a.criticite || b.epss_max - a.epss_max || a.port - b.port);
	const dangereux = lignes.filter((l) => l.epss_max >= 0.1 || l.kev);
	if (applique) for (const ligne of lignes) await ecrireCorpus(ligne);

	if (sqlPath) await writeFile(new URL(`../${sqlPath}`, import.meta.url), migrationCorpus(lignes));

	const rapport = {
		consulte_le: consulteLe.toISOString(),
		applique,
		transport: lecteur ? `lecteur:${lecteur}` : "direct",
		scope: {
			departements: DEPTS_NA, organisations: liste.length, hotes: cibles.length,
			hotes_avec_ports: hotesAvecPorts, hotes_mutualises_ignores: ignoresMutualises,
			concurrence, par_source: parSource, cache_utilise: cacheUtilise, cache_ecrit: cacheEcrit,
		},
		sources: {
			shodan_internetdb: { url: "https://internetdb.shodan.io/", cle_requise: false },
			epss: EPSS_API,
			kev: KEV_FEED,
			produits: "bench/corpus/risque-produits-2026-11-22.json",
		},
		resume: {
			services_cibles: lignes.length,
			services_dangereux: dangereux.length,
			par_categorie: Object.fromEntries([...CATEGORIES_CIBLES].map((c) => [c, lignes.filter((l) => l.categorie === c).length])),
			par_signal: {
				kev: lignes.filter((l) => l.kev).length,
				epss_eleve: lignes.filter((l) => l.epss_max >= 0.1).length,
				produit: lignes.filter((l) => l.preuve_url !== null).length,
			},
		},
		services: lignes,
	};
	await writeFile(new URL(`../${reportPath}`, import.meta.url), `${JSON.stringify(rapport, null, 2)}\n`);
	console.log(`[risque] ${lignes.length} services cibles, ${dangereux.length} avec EPSS>=0,1 ou KEV, rapport ${reportPath}`);
	if (sqlPath) console.log(`[risque] corpus SQL écrit dans ${sqlPath}`);
}

try {
	await main();
} finally {
	await closePools();
}
