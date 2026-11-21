#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Inventaire consultatif de l'exposition des organisations de Nouvelle-Aquitaine.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/collecte-exposition.mts [--apply] [--limit=N] [--report=fichier]
 *
 * Sources : DNS (résolution seule), Shodan InternetDB (API gratuite sans clé)
 * et LeakIX (API nécessitant une clé personnelle, `LEAKIX_API_KEY`).
 * Aucun port n'est scanné : l'API public renvoie ce qu'elle a déjà observé.
 * Sans --apply, aucun écriture en base ; le rapport JSON est toujours produit.
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

const CORPUS = [
	["communes.jsonl", "collectivite"],
	["institutions.jsonl", "ess"],
	["sante-enseignement.jsonl", "sante"],
	["presse.jsonl", "entreprise"],
	["quotidiens.jsonl", "entreprise"],
	["technique.jsonl", "entreprise"],
] as const;

const args = process.argv.slice(2);
const applique = args.includes("--apply");
const limiteArg = args.find((a) => a.startsWith("--limit="));
const limite = limiteArg ? Number(limiteArg.slice(8)) : Infinity;
const rapportArg = args.find((a) => a.startsWith("--report="));
const rapport = rapportArg?.slice(9) ?? "bench/results/exposition-2026-11-21.json";
const leakixKey = process.env.LEAKIX_API_KEY?.trim() || null;
const consulteLe = new Date();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Candidat = {
	host: string;
	name: string;
	siren: string | null;
	dept: string | null;
	kind: string;
	url: string;
	corpus: string;
};

async function candidats(): Promise<Candidat[]> {
	const trouve = new Map<string, Candidat>();
	for (const [fichier, kind] of CORPUS) {
		const contenu = await readFile(new URL(`../bench/corpus/${fichier}`, import.meta.url), "utf8");
		for (const ligne of contenu.split("\n")) {
			if (!ligne.trim()) continue;
			const objet = JSON.parse(ligne) as Record<string, string>;
			const url = objet.url_finale || objet.url || objet.website || objet.site;
			if (!url) continue;
			let host: string;
			try { host = new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
			catch { continue; }
			if (!/^[a-z0-9-]+\.[a-z]{2,}$/.test(host)) continue;
			if (!trouve.has(host)) {
				trouve.set(host, {
					host,
					name: objet.nom || objet.organisation || objet.name || objet.title || host,
					siren: objet.siren || objet.code_siren || null,
					dept: objet.departement || objet.dept || null,
					kind,
					url,
					corpus: fichier,
				});
			}
		}
	}
	const db = await ingestQuery<{ domain: string | null; name: string; dept: string | null; siren: string | null }>(
		"SELECT domain, name, dept, siren FROM org WHERE domain IS NOT NULL AND domain <> ''",
	);
	for (const org of db.rows) {
		const host = (org.domain ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
		if (host && /^[a-z0-9-]+\.[a-z]{2,}$/.test(host) && !trouve.has(host)) {
			trouve.set(host, { host, name: org.name, siren: org.siren, dept: org.dept, kind: "entreprise", url: "", corpus: "referentiel" });
		}
	}
	return [...trouve.values()];
}

async function hostsResolus(liste: Candidat[]): Promise<{ candidat: Candidat; ip: string }[]> {
	const cibles: { candidat: Candidat; ip: string }[] = [];
	for (let i = 0; i < liste.length; i += 16) {
		const lots = await Promise.all(liste.slice(i, i + 16).map(async (candidat) => {
			try {
				const ips = await resolve4(candidat.host, { ttl: false });
				return ips.map((ip) => ({ candidat, ip }));
			} catch {
				return [];
			}
		}));
		cibles.push(...lots.flat());
	}
	return cibles;
}
async function orgIdPour(candidat: Candidat): Promise<number> {
	if (candidat.siren) {
		const parSiren = await query<{ id: number }>("SELECT id FROM org WHERE siren = $1 LIMIT 1", [candidat.siren]);
		if (parSiren.rows[0]) return parSiren.rows[0].id;
	}
	const parDomaine = await query<{ id: number }>(
		"SELECT id FROM org WHERE lower(domain) = $1 OR lower(website) LIKE $2 LIMIT 1",
		[candidat.host, `%://${candidat.host}%`],
	);
	if (parDomaine.rows[0]) return parDomaine.rows[0].id;

	const slugBase = candidat.host.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
	const insere = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, dept, domain, website, status)
		 VALUES ($1,$2,$3,$4,$5,$6,'a_confirmer') RETURNING id`,
		[candidat.name, slugBase, candidat.kind, candidat.dept, candidat.host, candidat.url || `https://${candidat.host}`],
	);
	return insere.rows[0]!.id;
}

type RapportLeakix = { etat: string; detail: string; documentation: string; httpStatus?: number };

async function consulterLeakIX(ip: string): Promise<RapportLeakix> {
	const documentation = "https://docs.leakix.net/docs/api/authentication/";
	if (!leakixKey) {
		// Une requête sans clé est tentée pour tracer le refus réel du service.
		try {
			const r = await fetch(`https://leakix.net/api/host/${ip}`, {
				headers: { Accept: "application/json" },
				signal: AbortSignal.timeout(10000),
			});
			return { etat: "cle_requise", detail: `HTTP ${r.status} sans clé API`, documentation, httpStatus: r.status };
		} catch (e) {
			return { etat: "indisponible", detail: String(e), documentation };
		}
	}
	try {
		const r = await fetch(`https://leakix.net/api/host/${ip}`, {
			headers: { Accept: "application/json", "api-key": leakixKey },
			signal: AbortSignal.timeout(10000),
		});
		if (!r.ok) return { etat: "erreur", detail: `HTTP ${r.status}`, documentation, httpStatus: r.status };
		const donnees = (await r.json()) as Record<string, unknown>;
		return { etat: "consulte", detail: `réponse JSON pour ${ip} (${Object.keys(donnees).length} champs)`, documentation };
	} catch (e) {
		return { etat: "indisponible", detail: String(e), documentation };
	}
}

async function main(): Promise<void> {
	const liste = await candidats();
	const cibles = await hostsResolus(liste);
	const ips = new Map<string, Candidat[]>();
	for (const { candidat, ip } of cibles) {
		const groupe = ips.get(ip) ?? [];
		groupe.push(candidat);
		ips.set(ip, groupe);
	}
	console.log(`[exposition] ${liste.length} organisations, ${cibles.length} résolutions DNS, ${ips.size} IP uniques`);

	const mesures: { ip: string; candidats: Candidat[]; services: ServiceExpose[] }[] = [];
	let traitees = 0;
	for (const [ip, groupes] of ips) {
		if (traitees >= limite) break;
		let payload: Record<string, unknown> | null = null;
		try {
			const r = await fetch(urlInternetDb(ip), { signal: AbortSignal.timeout(12000) });
			if (r.ok) payload = (await r.json()) as Record<string, unknown>;
		} catch {
			// IP absente de la base publique ou requête expirée : pas de mesure.
		}
		traitees++;
		if (payload && Array.isArray(payload.ports) && payload.ports.length) {
			for (const candidat of groupes) {
				mesures.push({
					ip,
					candidats: [candidat],
					services: servicesDepuisInternetDb(payload as Parameters<typeof servicesDepuisInternetDb>[0], { consulteLe, domaineResolu: candidat.host }),
				});
			}
		}
		await sleep(1150); // limite gratuite InternetDB : une requête par seconde.
	}

	const leakix = await consulterLeakIX(mesures[0]?.ip ?? "192.0.2.1");
	const lignes: Record<string, unknown>[] = [];
	const orgs = new Set<string>();
	let servicesEcrits = 0;
	for (const mesure of mesures) {
		const candidat = mesure.candidats[0]!;
		let orgId: number | null = null;
		if (applique) {
			orgId = await orgIdPour(candidat);
			servicesEcrits += await enregistrerServices(orgId, mesure.services);
		}
		orgs.add(candidat.host);
		lignes.push({
			organisation: candidat.name,
			domaine: candidat.host,
			departement: candidat.dept,
			org_id: orgId,
			ip: mesure.ip,
			ports: mesure.services.map((s) => s.port),
			services: mesure.services.map((s) => ({ port: s.port, categorie: s.category, service: s.service, technologie: s.technology, version: s.version })),
			source: "shodan-internetdb",
			source_url: urlInternetDb(mesure.ip),
			consulte_le: consulteLe.toISOString(),
		});
	}

	const parCategorie = new Map<string, number>();
	for (const ligne of lignes) {
		for (const s of ligne.services as { categorie: string }[]) {
			parCategorie.set(s.categorie, (parCategorie.get(s.categorie) ?? 0) + 1);
		}
	}
	const rapportJson = {
		consulte_le: consulteLe.toISOString(),
		applique,
		sources: {
			shodan_internetdb: { url: "https://internetdb.shodan.io/", cle_requise: false, ip_interrogees: traitees },
			leakix,
		},
		resume: {
			organisations_couvertes: orgs.size,
			services_exposes: lignes.reduce((n, l) => n + (l.services as unknown[]).length, 0),
			par_categorie: Object.fromEntries(parCategorie),
			ecritures_base: servicesEcrits,
		},
		lignes,
	};
	await writeFile(rapport, `${JSON.stringify(rapportJson, null, 2)}\n`);
	console.log(`[exposition] ${orgs.size} organisations, ${rapportJson.resume.services_exposes} services, rapport ${rapport}`);
}

try {
	await main();
} finally {
	await closePools();
}
