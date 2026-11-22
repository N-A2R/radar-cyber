/**
 * Qualification of the Ministry of National Education establishment directory.
 *
 * Only the public UAI, SIRET, department and declared website are read.
 * Establishment names, postal addresses, emails and phone numbers are never
 * copied into a candidate or a report.
 */
import { publicWebsite } from "./public-site.js";

export const EDUCATION_SOURCE = "education-http-200";

export type EducationRow = Record<string, string | undefined>;

export type EducationCandidate = {
	uai: string;
	siren: string | null;
	website: string;
	domain: string;
	dept: string;
};

/** Maps one directory row to a joinable establishment website, or `null`. */
export function educationCandidate(
	row: EducationRow,
	departments: readonly string[],
): EducationCandidate | null {
	const uai = String(row["Identifiant_de_l_etablissement"] ?? "").trim();
	if (!/^\d{7}[A-Z]$/.test(uai)) return null;
	const site = publicWebsite(row["Web"]);
	if (!site) return null;
	const dept = String(Number(String(row["Code_departement"] ?? "").trim())).padStart(2, "0");
	if (!departments.includes(dept)) return null;
	const siret = String(row["SIREN_SIRET"] ?? "").trim();
	const siren = /^\d{9}$|^\d{14}$/.test(siret) ? siret.slice(0, 9) : null;
	return { uai, siren, website: site.website, domain: site.domain, dept };
}
