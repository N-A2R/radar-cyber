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
import { createHash } from "node:crypto";

const ALGO_SHA256 = Buffer.from("300d06096086480165030402010500", "hex");
const OID_SHA256 = Buffer.from("608648016503040201", "hex");
const OID_SIGNED_DATA = Buffer.from("2a864886f70d010702", "hex");
const OID_TST_INFO = Buffer.from("2a864886f70d0109100104", "hex");

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

function decoderPlage(octets: Buffer, debut: number, fin: number): NoeudDer[] {
	const noeuds: NoeudDer[] = [];
	let position = debut;
	while (position < fin) {
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
			enfants: (tag & 0x20) !== 0 ? decoderPlage(octets, contenuDebut, contenuFin) : [],
		});
		position = contenuFin;
	}
	return noeuds;
}

function decoder(octets: Buffer): NoeudDer {
	const [racine] = decoderPlage(octets, 0, octets.length);
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

export type JetonVerifie = {
	genTime: string;
	serial: string;
	nonce: string | null;
	certificat: string;
};

/**
 * Contrôle structural d'un jeton CMS signé (ContentInfo/SignedData/TSTInfo).
 * La signature elle-même se vérifie avec le certificat public joint, ici
 * renvoyé en base64 DER. L'empreinte doit correspondre à celle envoyée.
 */
export function verifierJeton(jeton: string | Buffer, empreinte: Buffer): JetonVerifie {
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
	const hash = attendu(imprint.enfants[1], 0x04, "hashedMessage").contenu;
	if (!hash.equals(empreinte)) {
		throw new Error("jeton RFC 3161 : l'empreinte ne couvre pas cette racine");
	}
	const genTime = attendu(tstInfo.enfants[4], 0x18, "genTime").contenu.toString("ascii");
	const serial = attendu(tstInfo.enfants[3], 0x02, "serialNumber").contenu.toString("hex");
	const nonceNoeud = tstInfo.enfants.slice(5).find((n) => n.tag === 0x02);
	const certificatNoeud = signedData.enfants.find((n) => n.tag === 0xa0)?.enfants.find((n) => n.tag === 0x30);
	return {
		genTime: heureGeneralisee(genTime),
		serial,
		nonce: nonceNoeud?.contenu.toString("hex") ?? null,
		certificat: certificatNoeud ? octets.subarray(certificatNoeud.debut, certificatNoeud.fin).toString("base64") : "",
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

/** Fournisseur réel : requête HTTP vers une TSA, réponse validée avant emploi. */
export function fournisseurRfc3161(options: {
	url?: string;
	timeoutMs?: number;
	fetchImpl?: typeof globalThis.fetch;
} = {}): FournisseurJeton {
	return async (racineSha256) => {
		const url = options.url ?? process.env.RADAR_TSA_URL ?? "https://freetsa.org/tsr";
		const empreinte = empreinteRacine(racineSha256);
		const reponse = await (options.fetchImpl ?? globalThis.fetch)(url, {
			method: "POST",
			headers: { "Content-Type": "application/timestamp-query" },
			body: requeteTimestamp(empreinte),
			signal: AbortSignal.timeout(options.timeoutMs ?? 15000),
		});
		if (!reponse.ok) throw new Error(`TSA ${url} : HTTP ${reponse.status}`);
		const jeton = extraireJeton(Buffer.from(await reponse.arrayBuffer())).toString("base64");
		const verifie = verifierJeton(jeton, empreinte);
		return {
			jeton,
			certificat: verifie.certificat,
			tsaUrl: url,
			genTime: verifie.genTime,
			serial: verifie.serial,
			nonce: verifie.nonce,
		};
	};
}
