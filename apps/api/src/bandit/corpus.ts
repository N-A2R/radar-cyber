// Lecture et validation du corpus gelé d'armes. Le JSON issu de PostgreSQL
// garde les noms de colonnes `in` / `new` ; ils sont traduits ici, une seule
// fois, pour que le bandit ne travaille qu'avec des compteurs typés.
import type { SourceArm } from "./sources.js";

export interface CorpusBandit {
  provenance: string;
  fenetre_jours: number;
  requete: string;
  reference: { valeur: number; source: string };
  arms: ReadonlyArray<{ id: string; family: string; in: number; new: number; runs: number }>;
}

export function lireCorpus(donnees: unknown): CorpusBandit {
  if (typeof donnees !== "object" || donnees === null) throw new Error("corpus bandit illisible");
  const corps = donnees as Partial<CorpusBandit>;
  if (!Array.isArray(corps.arms) || corps.arms.length === 0) {
    throw new Error("corpus bandit sans armes");
  }
  const ids = new Set<string>();
  for (const arm of corps.arms) {
    if (!arm || typeof arm.id !== "string" || !arm.id) throw new Error("arme sans identifiant");
    if (ids.has(arm.id)) throw new Error(`arme en double : ${arm.id}`);
    ids.add(arm.id);
    for (const champ of ["in", "new", "runs"] as const) {
      if (!Number.isInteger(arm[champ]) || (arm[champ] as number) < 0) {
        throw new Error(`${arm.id} : ${champ} invalide`);
      }
    }
    if (arm.in === 0 || arm.new > arm.in) throw new Error(`${arm.id} : compteurs incohérents`);
  }
  if (typeof corps.provenance !== "string" || !corps.provenance) {
    throw new Error("corpus bandit sans provenance");
  }
  return corps as CorpusBandit;
}

export function armesDuCorpus(corpus: CorpusBandit): SourceArm[] {
  return corpus.arms.map((a) => ({
    id: a.id,
    family: a.family,
    itemsIn: a.in,
    itemsNew: a.new,
    runs: a.runs,
  }));
}
