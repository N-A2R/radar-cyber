/**
 * Department labels used by Nouvelle-Aquitaine organisations.
 *
 * The territorial reference uses INSEE codes, while SIRENE-derived rows may
 * store the full French department name instead. Both forms are mapped to the
 * same twelve codes; nothing outside the region is accepted.
 */
import { NA_DEPARTMENTS, normalizeCommuneName } from "./commune-index.js";

/** Normalised French department names of Nouvelle-Aquitaine. */
const NA_DEPARTMENT_NAMES: Readonly<Record<string, string>> = Object.freeze({
  charente: "16",
  charentemaritime: "17",
  correze: "19",
  creuse: "23",
  dordogne: "24",
  gironde: "33",
  landes: "40",
  lotetgaronne: "47",
  pyreneesatlantiques: "64",
  deuxsevres: "79",
  vienne: "86",
  hautevienne: "87",
});

/**
 * Returns the INSEE code for a Nouvelle-Aquitaine department code or name.
 * Returns null for missing, malformed or out-of-region values.
 */
export function naDepartmentCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{1,2}$/.test(trimmed)) {
    const code = trimmed.padStart(2, "0");
    return (NA_DEPARTMENTS as readonly string[]).includes(code) ? code : null;
  }
  return NA_DEPARTMENT_NAMES[normalizeCommuneName(trimmed)] ?? null;
}

/** True for a Nouvelle-Aquitaine INSEE code, department name or region label. */
export function isNaDepartmentValue(value: string | null | undefined): boolean {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed !== "" &&
    (naDepartmentCode(trimmed) !== null || normalizeCommuneName(trimmed) === "nouvelleaquitaine");
}

/** Raw department values found in the database that belong to the region. */
export function naDepartmentsIn(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => naDepartmentCode(value) !== null))];
}
