/**
 * Objectif chiffré du chantier « chaîne de preuve d'un événement ».
 *
 * Module pur : la ligne OBJECTIF publiée dans `docs/chaine-de-preuve.md` est
 * produite depuis la mesure de `pnpm verifie:preuve`, jamais recopiée à la
 * main dans deux endroits différents.
 */

export const OBJECTIF_PREUVE = {
  verifications: 7,
  sansPreuve: 0,
} as const;

export type MesureObjectifPreuve = {
  verificationsOk: number;
  verificationsTotal: number;
  sansPreuve: number;
};

/** La ligne normative, identique dans le rapport et dans la vérification. */
export function ligneObjectifPreuve(mesure: MesureObjectifPreuve): string {
  const livree =
    `${mesure.verificationsOk}/${mesure.verificationsTotal} vérifications de la chaîne de preuve, ` +
    `${mesure.sansPreuve} événement${mesure.sansPreuve === 1 ? "" : "s"} sans preuve sur 30 jours`;
  const cible =
    `${OBJECTIF_PREUVE.verifications}/${OBJECTIF_PREUVE.verifications} vérifications, ` +
    `${OBJECTIF_PREUVE.sansPreuve} sans preuve`;
  const atteint =
    mesure.verificationsOk === OBJECTIF_PREUVE.verifications &&
    mesure.verificationsTotal === OBJECTIF_PREUVE.verifications &&
    mesure.sansPreuve === OBJECTIF_PREUVE.sansPreuve;
  if (atteint) return `OBJECTIF : atteint — ${livree} / ${cible}`;

  const manque = Math.max(0, OBJECTIF_PREUVE.verifications - mesure.verificationsOk);
  return (
    `OBJECTIF : partiel — ${livree} / ${cible}, manque ` +
    `${manque} vérification${manque === 1 ? "" : "s"} et ` +
    `${mesure.sansPreuve} événement${mesure.sansPreuve === 1 ? "" : "s"} sans preuve`
  );
}

/** Le rapport doit porter exactement une fois la ligne mesurée, pas une variante. */
export function verifierDeclarationObjectifPreuve(rapport: string, ligne: string): boolean {
  return rapport.split(/\r?\n/).filter((publiee) => publiee === ligne).length === 1;
}
