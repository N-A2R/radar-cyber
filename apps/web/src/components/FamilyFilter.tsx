import { FAMILIES } from "@radar/shared";
import "./panels.css";

/** Famille d'événement du Radar, partagée avec les collecteurs. */
type Family = (typeof FAMILIES)[number];

const FAMILY_LABEL: Record<Family, string> = {
  ransomware: "rançongiciel",
  vuln: "vulnérabilité",
  phishing: "hameçonnage",
  malware: "maliciel",
  cert: "certificats",
  cert_fr: "CERT-FR",
  typosquat: "typosquatting",
  reputation: "réputation",
  cti: "CTI",
  presse: "presse",
};

export interface FamilyFilterProps {
  /**
   * Familles sélectionnées. Un `Set` vide signifie « toutes les familles »
   * (aucun filtre) ; l'appelant applique le filtrage le cas échéant.
   */
  value: Set<string>;
  /** Appelé avec une copie du nouvel ensemble à chaque bascule de famille. */
  onChange: (families: Set<string>) => void;
  /** Compteurs optionnels par famille (ex. `stats.byFamily`). */
  counts?: Record<string, number>;
  /** Classe CSS ajoutée à la racine du panneau. */
  className?: string;
}

/**
 * Sélecteur multi-familles du Radar (composant pur : aucune requête réseau).
 *
 * Props :
 * - `value` : familles sélectionnées (`Set<string>`) ; un `Set` vide = toutes ;
 * - `onChange` : appelé avec le nouvel ensemble (`Set<string>`) à chaque bascule ;
 * - `counts` : compteurs optionnels par famille, affichés sur les chips ;
 * - `className` : classe CSS additionnelle sur la racine.
 */
export default function FamilyFilter({ value, onChange, counts, className }: FamilyFilterProps) {
  const rootClassName = ["family-filter", className].filter(Boolean).join(" ");

  const toggle = (family: string) => {
    const next = new Set(value);
    if (next.has(family)) next.delete(family);
    else next.add(family);
    onChange(next);
  };

  return (
    <section className={rootClassName} aria-label="Filtres par famille">
      <div className="family-filter__chips" role="group" aria-label="Sélection des familles">
        {FAMILIES.map((family) => {
          const selected = value.has(family);
          const count = counts?.[family];
          return (
            <button
              key={family}
              type="button"
              className="family-filter__chip"
              data-family={family}
              aria-pressed={selected}
              onClick={() => toggle(family)}
            >
              <span className="family-filter__label">{FAMILY_LABEL[family]}</span>
              {count != null ? (
                <span className="family-filter__count">{count.toLocaleString("fr-FR")}</span>
              ) : null}
            </button>
          );
        })}
        {value.size > 0 ? (
          <button type="button" className="family-filter__reset" onClick={() => onChange(new Set())}>
            réinitialiser ({value.size})
          </button>
        ) : null}
      </div>
    </section>
  );
}
