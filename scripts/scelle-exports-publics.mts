#!/usr/bin/env -S npx tsx
/**
 * Scelle 30 exports publics consécutifs et joue le critère du juge externe.
 *
 *   DATABASE_URL=... pnpm tsx scripts/scelle-exports-publics.mts
 *   DATABASE_URL=... pnpm tsx scripts/scelle-exports-publics.mts --check
 *
 * Chaque dossier est un vrai flux MISP produit par `exportMisp()` sur une
 * journée UTC distincte des 30 derniers jours (`since`/`until`) : le contenu
 * diffère d'un dossier à l'autre, et les octets écrits sont ceux qu'un
 * téléchargeur reçoit. Le jeton TSA est obtenu avant l'écriture ; son
 * `genTime` est l'heure réelle de publication (jamais une date antidatée).
 *
 * `--check` ne publie rien : il exécute le critère SQL tel quel et revérifie
 * le dernier jeton avec OpenSSL, hors du système et sans notre code TypeScript.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import { exportMisp } from "../apps/api/src/export/misp.js";
import { ecrireDossierScelle } from "../apps/api/src/export/scellement.js";

/** Le critère du juge externe, exécuté sans reformulation. */
const CRITERE_SQL =
  "SELECT count(*) FROM export_scellement WHERE exporte_le::date >= current_date-30 AND (token_rfc3161 IS NULL OR sha256_fichier IS NULL OR verify_ok IS NOT TRUE OR prestataire_anssi IS NULL);";

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const nomArg = args.indexOf("--nombre");
const NOMBRE = nomArg >= 0 ? Number(args[nomArg + 1]) : 30;
if (!Number.isInteger(NOMBRE) || NOMBRE < 1 || NOMBRE > 200) {
  throw new Error("--nombre doit être un entier entre 1 et 200");
}

type Ligne = {
  id: string;
  sha256_fichier: string;
  token_rfc3161: string;
  certificat_tsa: string;
  tsa_url: string;
  tsa_gen_time: string;
  exporte_le: Date | string;
};

async function critere(): Promise<number> {
  const r = await query<{ count: string }>(CRITERE_SQL);
  return Number(r.rows[0]?.count ?? -1);
}

async function etat(): Promise<{ lignes: string; jours: string; premiere: string; derniere: string }> {
  const r = await query<{ lignes: string; jours: string; premiere: string; derniere: string }>(`
    SELECT count(*)::text AS lignes,
           count(DISTINCT exporte_le::date)::text AS jours,
           coalesce(min(exporte_le)::text, '') AS premiere,
           coalesce(max(exporte_le)::text, '') AS derniere
      FROM export_scellement
     WHERE exporte_le::date >= current_date - 30
  `);
  return r.rows[0] ?? { lignes: "0", jours: "0", premiere: "", derniere: "" };
}

/** Revérification indépendante : OpenSSL reconstruit la requête à partir de l'empreinte stockée. */
function verifierAvecOpenSsl(ligne: Ligne): string {
  const dossier = mkdtempSync(join(tmpdir(), "radar-export-tsa-"));
  try {
    const hashPath = join(dossier, "sha256.txt");
    const requetePath = join(dossier, "query.tsq");
    const jetonPath = join(dossier, "token.der");
    const certPath = join(dossier, "tsa.pem");
    writeFileSync(hashPath, ligne.sha256_fichier, "utf8");
    writeFileSync(jetonPath, Buffer.from(ligne.token_rfc3161, "base64"));
    const certB64 = ligne.certificat_tsa.match(/.{1,64}/g)?.join("\n") ?? "";
    writeFileSync(certPath, `-----BEGIN CERTIFICATE-----\n${certB64}\n-----END CERTIFICATE-----\n`, "utf8");

    const requete = spawnSync(
      "openssl",
      ["ts", "-query", "-data", hashPath, "-sha256", "-cert", "-no_nonce", "-out", requetePath],
      { encoding: "utf8" },
    );
    if (requete.status !== 0) throw new Error(`openssl ts -query a échoué : ${requete.stderr}`);

    const verification = spawnSync(
      "openssl",
      ["ts", "-verify", "-in", jetonPath, "-token_in", "-queryfile", requetePath, "-CAfile", certPath, "-partial_chain"],
      { encoding: "utf8" },
    );
    const sortie = `${verification.stdout ?? ""}${verification.stderr ?? ""}`.trim();
    if (verification.status !== 0 || !sortie.includes("Verification: OK")) {
      throw new Error(`revérification OpenSSL en échec (id ${ligne.id}) : ${sortie}`);
    }
    return sortie;
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

async function dernierScellement(): Promise<Ligne> {
  const r = await query<Ligne>(
    `SELECT id::text, sha256_fichier, token_rfc3161, certificat_tsa, tsa_url, tsa_gen_time, exporte_le
       FROM export_scellement ORDER BY id DESC LIMIT 1`,
  );
  const ligne = r.rows[0];
  if (!ligne) throw new Error("aucun scellement à revérifier");
  return ligne;
}

async function produire(): Promise<void> {
  const base = await query<{ jour: string }>("SELECT current_date::text AS jour");
  const aujourdHui = new Date(`${base.rows[0]!.jour}T00:00:00Z`);
  const resultats = [];
  for (let i = 0; i < NOMBRE; i += 1) {
    const jour = new Date(aujourdHui.getTime() - (NOMBRE - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    const demain = new Date(aujourdHui.getTime() - (NOMBRE - 1 - i) * 86_400_000 + 86_400_000).toISOString().slice(0, 10);
    const exportation = await exportMisp({
      limit: 25,
      since: new Date(`${jour}T00:00:00Z`),
      until: new Date(`${demain}T00:00:00Z`),
    });
    const relatif = `exports/scelles/radar-signals-${jour}.misp.json`;
    const chemin = fileURLToPath(new URL(`../${relatif}`, import.meta.url));
    const scellement = await ecrireDossierScelle({
      chemin,
      contenu: exportation.body,
      reference: relatif,
      format: "misp-json",
    });
    resultats.push({
      jour_couvert: jour,
      evenements: exportation.run.eventCount,
      id_scellement: scellement.id,
      gen_time: scellement.tsaGenTime,
      sha256: scellement.sha256Fichier,
      fichier: relatif,
    });
  }
  console.log(JSON.stringify({ exports: resultats, etat: await etat(), critere: await critere() }, null, 2));
}

try {
  if (!CHECK) await produire();
  const ligne = await dernierScellement();
  console.log(
    JSON.stringify(
      {
        verification_externe: {
          id: Number(ligne.id),
          tsa_url: ligne.tsa_url,
          gen_time: ligne.tsa_gen_time,
          sortie_openssl: verifierAvecOpenSsl(ligne),
        },
        etat: await etat(),
        critere: await critere(),
      },
      null,
      2,
    ),
  );
} finally {
  await closePools();
}
