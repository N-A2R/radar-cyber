/**
 * Jeton temporel RFC 3161 — client TSA HTTP sans dépendance externe.
 *
 * On encode à la main les deux structures ASN.1/DER dont on a besoin :
 * `TimeStampReq` (emise) et `TimeStampResp`/`TSTInfo` (reçue). Un jeton n'est
 * accepté que si son `messageImprint` reproduit exactement l'empreinte de la
 * racine envoyée : un jeton valide mais portant sur une autre racine ne prouve
 * rien, et doit être refusé.
 *
 * Aucun secret n'est stocké ici. L'URL de la TSA est configurable par
 * `RADAR_TSA_URL` (défaut : le service public freetsa.org). Le certificat
 * public de la TSA est joint au jeton dans l'ancrage, pour qu'un vérificateur
 * puisse contrôler la chaîne de signature sans nous faire confiance.
 */
import { MAX_TSA_RESPONSE_BYTES, readBoundedBody } from "../security/network.js";
import { createHash, createVerify, randomBytes, X509Certificate } from "node:crypto";

const ALGO_SHA256 = Buffer.from("300d06096086480165030402010500", "hex");
const OID_SHA256 = Buffer.from("608648016503040201", "hex");
const OID_SIGNED_DATA = Buffer.from("2a864886f70d010702", "hex");
const OID_TST_INFO = Buffer.from("2a864886f70d0109100104", "hex");
const OID_SHA384 = Buffer.from("608648016503040202", "hex");
const OID_SHA512 = Buffer.from("608648016503040203", "hex");
const OID_CONTENT_TYPE = Buffer.from("2a864886f70d010903", "hex");
const OID_MESSAGE_DIGEST = Buffer.from("2a864886f70d010904", "hex");
const OID_EKU_TIMESTAMP = Buffer.from("2b06010505070308", "hex");
const OID_EXT_EKU = Buffer.from("551d25", "hex");
const OID_EXT_BASIC_CONSTRAINTS = Buffer.from("551d13", "hex");
const HASH_PAR_OID: Record<string, string> = {
	[OID_SHA256.toString("hex")]: "sha256",
	[OID_SHA384.toString("hex")]: "sha384",
	[OID_SHA512.toString("hex")]: "sha512",
};
/** OIDs de signature : on exige qu'ils concordent avec l'algorithme d'empreinte CMS. */
const HASH_SIGNATURE_PAR_OID: Record<string, string> = {
	"2a8648ce3d040302": "sha256",
	"2a8648ce3d040303": "sha384",
	"2a8648ce3d040304": "sha512",
	"2a864886f70d01010b": "sha256",
	"2a864886f70d01010c": "sha384",
	"2a864886f70d01010d": "sha512",
	"2a864886f70d010101": "*",
};

const MAX_DER_DEPTH = 32;
const MAX_DER_NODES = 10_000;

type NoeudDer = {
	tag: number;
	debut: number;
	fin: number;
	contenu: Buffer;
	enfants: NoeudDer[];
};

function longueurDer(taille: number): Buffer {
	if (taille < 0x80) return Buffer.from([taille]);
	const octets: number[] = [];
	let reste = taille;
	while (reste > 0) {
		octets.unshift(reste & 0xff);
		reste = Math.floor(reste / 256);
	}
	return Buffer.from([0x80 | octets.length, ...octets]);
}

function tlv(tag: number, contenu: Buffer): Buffer {
	return Buffer.concat([Buffer.from([tag]), longueurDer(contenu.length), contenu]);
}

function entierDer(valeur: bigint): Buffer {
	if (valeur < 0n) throw new Error("un nonce DER ne peut pas être négatif");
	let hex = valeur.toString(16);
	if (hex.length % 2) hex = `0${hex}`;
	let octets = Buffer.from(hex, "hex");
	if ((octets[0] ?? 0) >= 0x80) octets = Buffer.concat([Buffer.from([0]), octets]);
	return tlv(0x02, octets);
}

function lireLongueur(octets: Buffer, position: number): { taille: number; debut: number } {
	const premier = octets[position];
	if (premier === undefined) throw new Error("DER tronqué : longueur absente");
	if (premier < 0x80) return { taille: premier, debut: position + 1 };
	const largeur = premier & 0x7f;
	if (largeur === 0 || largeur > 4) throw new Error("longueur DER non supportée");
	let taille = 0;
	for (let i = 0; i < largeur; i += 1) {
		const octet = octets[position + 1 + i];
		if (octet === undefined) throw new Error("DER tronqué : longueur courte");
		taille = taille * 256 + octet;
	}
	return { taille, debut: position + 1 + largeur };
}

function decoderPlage(octets: Buffer, debut: number, fin: number, profondeur = 0, budget: { nodes: number } = { nodes: 0 }): NoeudDer[] {
	const noeuds: NoeudDer[] = [];
	if (profondeur > MAX_DER_DEPTH) throw new Error("DER trop profond");
	let position = debut;
	while (position < fin) {
		budget.nodes += 1;
		if (budget.nodes > MAX_DER_NODES) throw new Error("DER : trop de nœuds");
		const tag = octets[position];
		if (tag === undefined) break;
		const { taille, debut: contenuDebut } = lireLongueur(octets, position + 1);
		const contenuFin = contenuDebut + taille;
		if (contenuFin > fin) throw new Error("TLV DER qui dépasse son parent");
		const contenu = octets.subarray(contenuDebut, contenuFin);
		noeuds.push({
			tag,
			debut: position,
			fin: contenuFin,
			contenu,
			enfants: (tag & 0x20) !== 0 ? decoderPlage(octets, contenuDebut, contenuFin, profondeur + 1, budget) : [],
		});
		position = contenuFin;
	}
	return noeuds;
}
function decoder(octets: Buffer): NoeudDer {
	const [racine] = decoderPlage(octets, 0, octets.length, 0, { nodes: 0 });
	if (!racine || racine.tag !== 0x30) throw new Error("DER racine invalide");
	return racine;
}

function attendu(noeud: NoeudDer | undefined, tag: number, nom: string): NoeudDer {
	if (!noeud || noeud.tag !== tag) throw new Error(`jeton RFC 3161 : ${nom} absent ou invalide`);
	return noeud;
}

/** Empreinte couverte par le jeton : SHA-256 de la racine hexadécimale ASCII. */
export function empreinteRacine(racineSha256: string): Buffer {
	if (!/^[0-9a-f]{64}$/.test(racineSha256)) {
		throw new Error("racine invalide : 64 hexadécimales minuscules attendues");
	}
	return createHash("sha256").update(racineSha256, "ascii").digest();
}

/** `TimeStampReq` DER : SHA-256, certReq = true, nonce optionnel. */
export function requeteTimestamp(hash: Buffer, nonce?: bigint): Buffer {
	if (hash.length !== 32) throw new Error("l'empreinte doit faire 32 octets (SHA-256)");
	const empreinte = tlv(0x30, Buffer.concat([ALGO_SHA256, tlv(0x04, hash)]));
	const champs: Buffer[] = [entierDer(1n), empreinte];
	if (nonce !== undefined) champs.push(entierDer(nonce));
	champs.push(tlv(0x01, Buffer.from([0xff])));
	return tlv(0x30, Buffer.concat(champs));
}

/** Extrait le `TimeStampToken` d'une réponse, après contrôle du statut TSA. */
export function extraireJeton(reponse: Buffer): Buffer {
	const racine = decoder(reponse);
	const statut = attendu(racine.enfants[0], 0x30, "statut");
	const code = statut.enfants[0]?.contenu[0];
	if (code === undefined || code > 1) {
		const raison = statut.enfants.find((n) => n.tag === 0x0c)?.contenu.toString("utf8") ?? "raison inconnue";
		throw new Error(`TSA a refusé la requête (statut ${code ?? "?"}) : ${raison}`);
	}
	const jeton = racine.enfants[1];
	if (!jeton) throw new Error("jeton RFC 3161 : réponse sans TimeStampToken");
	return reponse.subarray(jeton.debut, jeton.fin);
}

function heureGeneralisee(texte: string): string {
	const parties = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?Z$/.exec(texte);
	if (!parties) throw new Error(`heure TSA illisible : ${texte}`);
	const millisecondes = (parties[7] ?? "").padEnd(3, "0").slice(0, 3);
	return `${parties[1]}-${parties[2]}-${parties[3]}T${parties[4]}:${parties[5]}:${parties[6]}${millisecondes ? `.${millisecondes}` : ""}Z`;
}
export type OptionsVerification = {
	/** Nonce envoyé dans la requête : le jeton doit le retourner identique. */
	nonceAttendu?: bigint;
	/** Borne haute de `genTime` à l'acquisition (jamais pour un jeton archivé). */
	maintenant?: Date;
	margeMs?: number;
	/** Ancres de confiance PEM. À défaut, les variables RADAR_TSA_CA_PEM / RADAR_TSA_CERT_PEM. */
	certificatsConfiance?: readonly (string | Buffer)[];
};

function oidDe(noeud: NoeudDer | undefined): Buffer | undefined {
	const oid = noeud?.enfants[0];
	return oid?.tag === 0x06 ? oid.contenu : undefined;
}

function hashAlgorithme(noeud: NoeudDer, contexte: string): string {
	const oid = oidDe(noeud);
	const hash = oid ? HASH_PAR_OID[oid.toString("hex")] : undefined;
	if (!hash) throw new Error(`jeton RFC 3161 : ${contexte} non supporté`);
	return hash;
}

function findAttr(attrs: NoeudDer, oid: Buffer): NoeudDer | undefined {
	return attrs.enfants.find((noeud) => noeud.tag === 0x30 && oidDe(noeud)?.equals(oid));
}

/** Valeur d'un attribut CMS : SET OF { valeur }. */
function valeurAttr(attr: NoeudDer | undefined, tag: number): Buffer | undefined {
	const valeur = attr?.enfants[1]?.enfants.find((noeud) => noeud.tag === tag);
	return valeur?.contenu;
}

function certificatsDuJeton(signedData: NoeudDer, octets: Buffer): Buffer[] {
	return signedData.enfants
		.filter((noeud) => noeud.tag === 0xa0)
		.flatMap((noeud) => noeud.enfants)
		.filter((noeud) => noeud.tag === 0x30)
		.map((noeud) => octets.subarray(noeud.debut, noeud.fin));
}

function extensionX509(certificat: NoeudDer, oid: Buffer): Buffer | undefined {
	const tbs = certificat.enfants[0];
	const bloc = tbs?.enfants.find((noeud) => noeud.tag === 0xa3);
	const extensions = bloc?.enfants.find((noeud) => noeud.tag === 0x30);
	const trouvee = extensions?.enfants.find(
		(noeud) => noeud.tag === 0x30 && noeud.enfants.some((enfant) => enfant.tag === 0x06 && enfant.contenu.equals(oid)),
	);
	return trouvee?.enfants.find((noeud) => noeud.tag === 0x04)?.contenu;
}

/** Un certificat de TSA doit porter l'usage `timeStamping` et ne pas être une autorité. */
function verifierUsageTsa(certDer: Buffer, instant: number): X509Certificate {
	const certificat = new X509Certificate(certDer);
	const arbre = decoder(certDer);
	const eku = extensionX509(arbre, OID_EXT_EKU);
	const usages = eku ? decoder(eku).enfants.filter((noeud) => noeud.tag === 0x06) : [];
	if (!usages.some((noeud) => noeud.contenu.equals(OID_EKU_TIMESTAMP))) {
		throw new Error("jeton RFC 3161 : le certificat n'a pas l'usage timeStamping");
	}
	const contraintes = extensionX509(arbre, OID_EXT_BASIC_CONSTRAINTS);
	if (contraintes && decoder(contraintes).enfants.some((noeud) => noeud.tag === 0x01 && noeud.contenu[0] === 0xff)) {
		throw new Error("jeton RFC 3161 : le certificat signataire est une autorité");
	}
	if (instant < new Date(certificat.validFrom).getTime() || instant > new Date(certificat.validTo).getTime()) {
		throw new Error("jeton RFC 3161 : certificat hors de sa période de validité");
	}
	return certificat;
}

function certificatsConfiance(options: OptionsVerification): X509Certificate[] {
	const sources = options.certificatsConfiance ?? [
		process.env.RADAR_TSA_CA_PEM,
		process.env.RADAR_TSA_CERT_PEM,
	].filter((valeur): valeur is string => Boolean(valeur));
	const ancres: X509Certificate[] = [];
	for (const source of sources) {
		const pem = typeof source === "string" ? source : source.toString("utf8");
		for (const bloc of pem.matchAll(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g)) {
			ancres.push(new X509Certificate(Buffer.from(bloc[1]!.replace(/\s/g, ""), "base64")));
		}
	}
	return ancres;
}

/**
 * Vrai seulement si une ancre explicite a validé le certificat signataire.
 * Sans ancre configurée, la signature CMS est tout de même vérifiée, mais la
 * chaîne ne peut pas être revendiquée comme de confiance.
 */
function verifierChaine(
	certificat: X509Certificate,
	intermediaires: X509Certificate[],
	ancres: X509Certificate[],
): boolean {
	for (const ancre of ancres) {
		if (certificat.verify(ancre.publicKey)) return true;
		for (const intermediaire of intermediaires) {
			if (certificat.verify(intermediaire.publicKey) && intermediaire.verify(ancre.publicKey)) return true;
		}
	}
	return false;
}


export type JetonVerifie = {
	genTime: string;
	serial: string;
	nonce: string | null;
	certificat: string;
	/** La signature CMS a été vérifiée avec le certificat signataire joint. */
	signatureVerifiee?: boolean;
	/** Une ancre de confiance configurée a validé la chaîne (faux si aucune ancre). */
	chainVerifiee?: boolean;
};

/**
 * Vérifie un jeton CMS signé : structure, empreinte couverte, signature du
 * `SignedData`, attributs CMS, nonce, usage et validité du certificat TSA,
 * chaîne de confiance si une ancre est configurée. Un jeton forgé avec un
 * certificat auto-signé est rejeté dès que la signature est contrôlée ; sans
 * ancre, `chainVerifiee` reste faux et l'appelant ne doit pas revendiquer
 * une qualification de confiance.
 */
export function verifierJeton(
	jeton: string | Buffer,
	empreinte: Buffer,
	options: OptionsVerification = {},
): JetonVerifie {
	const octets = typeof jeton === "string" ? Buffer.from(jeton, "base64") : jeton;
	const contenuInfo = decoder(octets);
	if (!contenuInfo.enfants[0]?.contenu.equals(OID_SIGNED_DATA)) {
		throw new Error("jeton RFC 3161 : ContentInfo n'est pas signedData");
	}
	const enveloppe = attendu(contenuInfo.enfants[1], 0xa0, "contenu SignedData");
	const signedData = attendu(enveloppe.enfants[0], 0x30, "SignedData");
	const encapsule = attendu(signedData.enfants[2], 0x30, "encapContentInfo");
	if (!encapsule.enfants[0]?.contenu.equals(OID_TST_INFO)) {
		throw new Error("jeton RFC 3161 : le contenu n'est pas un TSTInfo");
	}
	const octetsTst = attendu(attendu(encapsule.enfants[1], 0xa0, "eContent").enfants[0], 0x04, "eContent OCTET STRING").contenu;
	const tstInfo = decoder(octetsTst);
	const imprint = attendu(tstInfo.enfants[2], 0x30, "messageImprint");
	const algo = attendu(imprint.enfants[0], 0x30, "hashAlgorithm");
	if (!algo.enfants[0]?.contenu.equals(OID_SHA256)) {
		throw new Error("jeton RFC 3161 : l'empreinte n'est pas en SHA-256");
	}
	const hashEmpreinte = hashAlgorithme(algo, "algorithme de messageImprint");
	if (hashEmpreinte !== "sha256") throw new Error("jeton RFC 3161 : messageImprint non SHA-256");
	const hash = attendu(imprint.enfants[1], 0x04, "hashedMessage").contenu;
	if (!hash.equals(empreinte)) {
		throw new Error("jeton RFC 3161 : l'empreinte ne couvre pas cette racine");
	}
	const genTime = heureGeneralisee(attendu(tstInfo.enfants[4], 0x18, "genTime").contenu.toString("ascii"));
	const instant = Date.parse(genTime);
	if (!Number.isFinite(instant)) throw new Error("jeton RFC 3161 : genTime invalide");
	if (options.maintenant) {
		const marge = options.margeMs ?? 5 * 60_000;
		const reference = options.maintenant.getTime();
		if (instant > reference + marge || instant < reference - marge) {
			throw new Error("jeton RFC 3161 : genTime hors de la fenêtre de l'horloge locale");
		}
	}
	const serial = attendu(tstInfo.enfants[3], 0x02, "serialNumber").contenu.toString("hex");
	const nonceNoeud = tstInfo.enfants.slice(5).find((noeud) => noeud.tag === 0x02);
	const nonce = nonceNoeud?.contenu.toString("hex") ?? null;
	if (options.nonceAttendu !== undefined && nonce !== options.nonceAttendu.toString(16).padStart(2, "0")) {
		throw new Error("jeton RFC 3161 : nonce retourné différent de celui de la requête");
	}

	const attestations = signedData.enfants.filter((noeud) => noeud.tag === 0x31);
	const signerInfo = attendu(attestations.at(-1)?.enfants[0], 0x30, "SignerInfo");
	const digestNoeud = attendu(signerInfo.enfants[2], 0x30, "digestAlgorithm CMS");
	const hashCms = hashAlgorithme(digestNoeud, "algorithme de hachage CMS");
	const signatureAlgo = attendu(
		signerInfo.enfants.find((noeud) => noeud.tag === 0x30 && noeud.enfants[0]?.tag === 0x06 && noeud !== digestNoeud),
		0x30, "signatureAlgorithm CMS",
	);
	const hashSig = HASH_SIGNATURE_PAR_OID[(oidDe(signatureAlgo) ?? Buffer.alloc(0)).toString("hex")];
	if (!hashSig || (hashSig !== "*" && hashSig !== hashCms)) {
		throw new Error("jeton RFC 3161 : algorithmes de signature et d'empreinte incompatibles");
	}

	const certificats = certificatsDuJeton(signedData, octets);
	const sid = attendu(signerInfo.enfants[1], signerInfo.enfants[1]?.tag ?? 0x30, "identifiant du signataire");
	let certDer: Buffer | undefined;
	if (sid.tag === 0x30) {
		const serialHex = sid.enfants.find((noeud) => noeud.tag === 0x02)?.contenu.toString("hex");
		if (serialHex) {
			const cible = BigInt(`0x${serialHex}`);
			certDer = certificats.find((der) => BigInt(`0x${new X509Certificate(der).serialNumber}`) === cible);
		}
	} else if (sid.tag === 0x80) {
		const ski = Buffer.from("551d0e", "hex");
		certDer = certificats.find((der) => {
			const ext = extensionX509(decoder(der), ski);
			return ext ? decoder(ext).contenu.equals(sid.contenu) : false;
		});
	}
	if (!certDer) throw new Error("jeton RFC 3161 : certificat du signataire absent du jeton");
	const certificat = verifierUsageTsa(certDer, instant);

	const attrs = signerInfo.enfants.find((noeud) => noeud.tag === 0xa0);
	const verifieur = createVerify(hashCms);
	if (attrs) {
		// `[0] IMPLICIT SET OF` se re-encode en `SET` (0x31) pour la vérification.
		verifieur.update(tlv(0x31, attrs.contenu));
		const digestAttendu = valeurAttr(findAttr(attrs, OID_MESSAGE_DIGEST), 0x04);
		if (!digestAttendu?.equals(createHash(hashCms).update(octetsTst).digest())) {
			throw new Error("jeton RFC 3161 : messageDigest CMS incorrect");
		}
		const contentType = valeurAttr(findAttr(attrs, OID_CONTENT_TYPE), 0x06);
		if (!contentType?.equals(OID_TST_INFO)) {
			throw new Error("jeton RFC 3161 : contentType CMS inattendu");
		}
	} else {
		verifieur.update(octetsTst);
	}
	const signature = attendu(signerInfo.enfants.find((noeud) => noeud.tag === 0x04), 0x04, "signature CMS").contenu;
	if (!verifieur.verify(certificat.publicKey, signature)) {
		throw new Error("jeton RFC 3161 : signature CMS invalide");
	}

	const intermediaires = certificats
		.filter((der) => !der.equals(certDer))
		.map((der) => new X509Certificate(der));
	const ancres = certificatsConfiance(options);
	return {
		genTime,
		serial,
		nonce,
		certificat: certDer.toString("base64"),
		signatureVerifiee: true,
		chainVerifiee: verifierChaine(certificat, intermediaires, ancres),
	};
}
export type JetonObtenu = {
	jeton: string;
	certificat: string;
	tsaUrl: string;
	genTime: string;
	serial: string;
	nonce: string | null;
};

export type FournisseurJeton = (racineSha256: string) => Promise<JetonObtenu>;

/** Fournisseur réel : nonce aléatoire, vérification complète, retry borné. */
export function fournisseurRfc3161(options: {
	url?: string;
	timeoutMs?: number;
	fetchImpl?: typeof globalThis.fetch;
	tentatives?: number;
	delaiBaseMs?: number;
	attente?: (ms: number) => Promise<void>;
	alea?: () => number;
	horloge?: () => Date;
	margeMs?: number;
	certificatsConfiance?: readonly (string | Buffer)[];
} = {}): FournisseurJeton {
	return async (racineSha256) => {
		const url = options.url ?? process.env.RADAR_TSA_URL ?? "https://freetsa.org/tsr";
		const empreinte = empreinteRacine(racineSha256);
		const tentatives = Math.min(5, Math.max(1, Math.floor(options.tentatives ?? 3)));
		const attente = options.attente ?? ((ms: number) => {
			const { promise, resolve } = Promise.withResolvers<void>();
			setTimeout(resolve, ms);
			return promise;
		});
		const alea = options.alea ?? Math.random;
		let dernierErreur: unknown;
		for (let tentative = 1; tentative <= tentatives; tentative += 1) {
			try {
				const nonce = BigInt(`0x${randomBytes(16).toString("hex")}`);
				const reponse = await (options.fetchImpl ?? globalThis.fetch)(url, {
					method: "POST",
					headers: { "Content-Type": "application/timestamp-query" },
					body: requeteTimestamp(empreinte, nonce),
					signal: AbortSignal.timeout(options.timeoutMs ?? 15000),
				});
				const jeton = extraireJeton(await readBoundedBody(reponse, MAX_TSA_RESPONSE_BYTES)).toString("base64");
				const verifie = verifierJeton(jeton, empreinte, {
					nonceAttendu: nonce,
					maintenant: (options.horloge ?? (() => new Date()))(),
					margeMs: options.margeMs,
					certificatsConfiance: options.certificatsConfiance,
				});
				return {
					jeton,
					certificat: verifie.certificat,
					tsaUrl: url,
					genTime: verifie.genTime,
					serial: verifie.serial,
					nonce: verifie.nonce,
				};
			} catch (erreur) {
				dernierErreur = erreur;
				if (tentative === tentatives) break;
				const delai = (options.delaiBaseMs ?? 250) * 2 ** (tentative - 1);
				const jitter = Math.floor(alea() * delai * 0.2);
				await attente(delai + jitter);
			}
		}
		const motif = dernierErreur instanceof Error ? dernierErreur.message : String(dernierErreur);
		throw new Error(`TSA ${url} : échec après ${tentatives} tentatives — ${motif}`);
	};
}
