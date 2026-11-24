/**
 * Échappement CSV partagé par tous les exports publics.
 *
 * Au-delà des virgules et des guillemets, une cellule commençant par `=`, `+`,
 * `-` ou `@` est interprétée comme une formule par Excel/LibreOffice. Un nom
 * de source ou une référence provenant d'un collecteur peut porter ce préfixe :
 * on le neutralise par une apostrophe avant citation (F16).
 */
export function celluleCsv(valeur: string | number | null | undefined): string {
  if (valeur === null || valeur === undefined) return "";
  const brut = String(valeur);
  const texte = /^\s*[=+\-@\t\r]/.test(brut) ? `'${brut}` : brut;
  return /[",\r\n]/.test(texte) ? `"${texte.replaceAll('"', '""')}"` : texte;
}

export function ligneCsv(cellules: readonly (string | number | null | undefined)[]): string {
  return cellules.map(celluleCsv).join(",") + "\r\n";
}
