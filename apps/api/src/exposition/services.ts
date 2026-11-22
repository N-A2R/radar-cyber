/**
 * Lecture des réponses Shodan InternetDB / LeakIX et écriture de l'inventaire.
 *
 * Toutes les mesures viennent d'API publiques interrogées en consultation :
 * aucun port n'est ouvert par le radar, aucun service n'est sondé directement.
 * La catégorie et le service sont déduits du numéro de port ; la technologie et
 * la version ne sont renseignées que lorsqu'un CPE correspond au port observé
 * (InternetDB donne des CPE au niveau de l'hôte, pas du port).
 */
import { ingestQuery } from "../db.js";

export const CATEGORIES = ["web", "mail", "vpn", "base_de_donnees", "autre"] as const;
export type Category = (typeof CATEGORIES)[number];

export type InternetDbResponse = {
	ip?: string;
	ports?: number[];
	cpes?: string[];
	hostnames?: string[];
	tags?: string[];
	vulns?: string[];
};

export type ServiceExpose = {
	ip: string;
	port: number;
	category: Category;
	service: string;
	technology: string;
	version: string | null;
	source: string;
	sourceUrl: string;
	consultedAt: Date;
	evidence: Record<string, unknown>;
};

type PortConnu = { category: Category; service: string; products: string[] };
type Cpe = { vendor: string; product: string; version: string | null };

const WEB = ["nginx", "apache", "http_server", "httpd", "iis", "lighttpd", "openresty", "tomcat", "jetty", "cloudflare", "php", "jquery", "jquery_ui", "wordpress", "drupal", "varnish_cache", "varnish_cache_plus", "plesk", "matomo", "react", "bootstrap", "moment", "amazon_cloudfront"];
const MAIL = ["postfix", "exim", "sendmail", "dovecot", "courier", "exchange", "mail_enable"];
const VPN = ["openvpn", "wireguard", "strongswan", "libreswan", "ipsec", "l2tp", "pptp", "softether"];
const BASE = ["postgresql", "mysql", "mariadb", "mongodb", "redis", "elasticsearch", "opensearch", "microsoft_sql_server", "oracle", "couchdb", "memcached"];
const FTP = ["pure-ftpd", "proftpd", "filezilla", "vsftpd", "ftp"];

/** Correspondances volontairement conservatrices : un port connu, un service connu. */
const PORTS: Record<number, PortConnu> = {
	21: { category: "autre", service: "ftp", products: FTP },
	22: { category: "autre", service: "ssh", products: ["openssh", "ssh"] },
	25: { category: "mail", service: "smtp", products: MAIL },
	53: { category: "autre", service: "dns", products: ["bind", "unbound", "powerdns", "dnsmasq"] },
	80: { category: "web", service: "http", products: WEB },
	110: { category: "mail", service: "pop3", products: MAIL },
	143: { category: "mail", service: "imap", products: MAIL },
	443: { category: "web", service: "https", products: WEB },
	465: { category: "mail", service: "smtps", products: MAIL },
	500: { category: "vpn", service: "ipsec", products: VPN },
	587: { category: "mail", service: "smtp-submission", products: MAIL },
	993: { category: "mail", service: "imaps", products: MAIL },
	995: { category: "mail", service: "pop3s", products: MAIL },
	1194: { category: "vpn", service: "openvpn", products: VPN },
	1433: { category: "base_de_donnees", service: "mssql", products: BASE },
	1521: { category: "base_de_donnees", service: "oracle", products: BASE },
	1701: { category: "vpn", service: "l2tp", products: VPN },
	1723: { category: "vpn", service: "pptp", products: VPN },
	3306: { category: "base_de_donnees", service: "mysql", products: BASE },
	3389: { category: "autre", service: "rdp", products: ["microsoft", "freerdp"] },
	4500: { category: "vpn", service: "ipsec-nat", products: VPN },
	5432: { category: "base_de_donnees", service: "postgresql", products: BASE },
	5984: { category: "base_de_donnees", service: "couchdb", products: BASE },
	6379: { category: "base_de_donnees", service: "redis", products: BASE },
	8000: { category: "web", service: "http-alt", products: WEB },
	8008: { category: "web", service: "http-alt", products: WEB },
	8080: { category: "web", service: "http-alt", products: WEB },
	8443: { category: "web", service: "https-alt", products: WEB },
	8888: { category: "web", service: "http-alt", products: WEB },
	9200: { category: "base_de_donnees", service: "elasticsearch", products: BASE },
	11211: { category: "base_de_donnees", service: "memcached", products: BASE },
	27017: { category: "base_de_donnees", service: "mongodb", products: BASE },
};

export function categoriePort(port: number): Category {
	return PORTS[port]?.category ?? "autre";
}

export function nomService(port: number): string {
	return PORTS[port]?.service ?? `port-${port}`;
}

/** CPE 2.3 (cpe:2.3:a:vendeur:produit:version:…) et CPE 2.2 URI (cpe:/a:vendeur:produit:version). */
export function analyserCpe(cpe: string): Cpe | null {
	const champs = cpe.split(":");
	const nettoyer = (v: string | undefined): string => (v ?? "").replace(/\\([.:_*?\\])/g, "$1");
	let vendor: string;
	let product: string;
	let version: string | null;
	if (champs[1] === "2.3" && champs.length >= 6) {
		vendor = nettoyer(champs[3]);
		product = nettoyer(champs[4]);
		const brut = nettoyer(champs[5]);
		version = brut && brut !== "*" && brut !== "-" ? brut : null;
	} else if (champs[1] === "/a" || champs[1] === "/o" || champs[1] === "/h") {
		vendor = nettoyer(champs[2]);
		product = nettoyer(champs[3]);
		const brut = nettoyer(champs[4]);
		version = brut && brut !== "*" && brut !== "-" ? brut : null;
	} else {
		return null;
	}
	if (!vendor && !product) return null;
	return { vendor, product, version };
}

function meilleurCpe(cpes: Cpe[], port: number): Cpe | null {
	const attendu = PORTS[port]?.products ?? [];
	const candidats = cpes.filter((c) => attendu.some((p) => c.product.includes(p) || c.vendor.includes(p)));
	return candidats.find((c) => c.version) ?? candidats[0] ?? null;
}

export function urlInternetDb(ip: string): string {
	return `https://internetdb.shodan.io/${ip}`;
}

/**
 * Transforme une réponse InternetDB en lignes citables.
 * `domaineResolu` est conservé comme preuve du rattachement IP → organisation.
 */
export function servicesDepuisInternetDb(
	payload: InternetDbResponse,
	opts: { source?: string; sourceUrl?: string; consulteLe?: Date; domaineResolu?: string } = {},
): ServiceExpose[] {
	const ip = payload.ip?.trim();
	if (!ip || !Array.isArray(payload.ports)) return [];
	const consulteLe = opts.consulteLe ?? new Date();
	const source = opts.source ?? "shodan-internetdb";
	const sourceUrl = opts.sourceUrl ?? urlInternetDb(ip);
	const cpes = (Array.isArray(payload.cpes) ? payload.cpes : [])
		.map(analyserCpe)
		.filter((c): c is Cpe => c !== null);
	const ports = [...new Set(payload.ports.filter((p) => Number.isInteger(p) && p > 0 && p <= 65535))].sort((a, b) => a - b);

	return ports.map((port) => {
		const cpe = meilleurCpe(cpes, port);
		const service = nomService(port);
		return {
			ip,
			port,
			category: categoriePort(port),
			service,
			technology: cpe?.product || service,
			version: cpe?.version ?? null,
			source,
			sourceUrl,
			consultedAt: consulteLe,
			evidence: {
				ports,
				cpes: Array.isArray(payload.cpes) ? payload.cpes : [],
				hostnames: Array.isArray(payload.hostnames) ? payload.hostnames : [],
				tags: Array.isArray(payload.tags) ? payload.tags : [],
				vulns: Array.isArray(payload.vulns) ? payload.vulns : [],
				domaineResolu: opts.domaineResolu ?? null,
			},
		};
	});
}

/** Une mesure remplace la précédente pour le même triplet organisation/IP/port/source. */
export async function enregistrerServices(orgId: number, services: ServiceExpose[]): Promise<number> {
	let ecrit = 0;
	for (const s of services) {
		await ingestQuery(
			`INSERT INTO exposition_service
			 (org_id, ip, port, category, service, technology, version, source, source_url, consulted_at, first_seen_at, evidence)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
			 ON CONFLICT (org_id, ip, port, source) DO UPDATE SET
			   category = EXCLUDED.category, service = EXCLUDED.service,
			   technology = EXCLUDED.technology, version = EXCLUDED.version,
			   source_url = EXCLUDED.source_url, consulted_at = EXCLUDED.consulted_at,
			   evidence = EXCLUDED.evidence`,
			[orgId, s.ip, s.port, s.category, s.service, s.technology, s.version, s.source, s.sourceUrl, s.consultedAt, s.consultedAt, JSON.stringify(s.evidence)],
		);
		ecrit++;
	}
	return ecrit;
}
