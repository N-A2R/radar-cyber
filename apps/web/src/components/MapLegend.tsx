import { FAMILIES } from "@radar/shared";

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

/** Natures d'organisation, dans l'ordre de la carte. */
const ORG_KINDS: { key: string; label: string }[] = [
  { key: "sante", label: "santé" },
  { key: "collectivite", label: "collectivité" },
  { key: "entreprise", label: "entreprise" },
  { key: "enseignement", label: "enseignement" },
  { key: "recherche", label: "recherche" },
  { key: "operateur_critique", label: "opérateur crit." },
];

/** Rampe de sévérité affichée en bas de la légende. */
const SEVERITY_RAMP: { label: string; color: string }[] = [
  { label: "S1", color: "var(--sev-1)" },
  { label: "S2", color: "var(--sev-2)" },
  { label: "S3", color: "var(--sev-3)" },
  { label: "S4", color: "var(--sev-4)" },
  { label: "S5", color: "var(--sev-5)" },
];

export interface MapLegendProps {
  /** Compteurs par famille (clé = famille). */
  counts?: Record<string, number>;
  /** Familles actives ; vide/indéfini = toutes les familles visibles. */
  active?: readonly string[];
  /** Bascule le filtre famille au clic (relayé à App.tsx). */
  onToggle?: (family: string) => void;
  /** Classe CSS ajoutée à la racine. */
  className?: string;
}

/**
 * Légende carte flottante (bas-gauche), doublée d'un filtre par famille.
 *
 * Rendue par App.tsx dans `.stage` ; `counts` = `counts` de App.
 */
export default function MapLegend({ counts, active, onToggle, className }: MapLegendProps) {
  const activeSet = new Set(active ?? []);
  const filtering = activeSet.size > 0;
  const rootClassName = ["map-legend", className].filter(Boolean).join(" ");

  return (
    <div className={rootClassName}>
      <div className="map-legend__group">
        <div className="micro">familles</div>
        <ul className="map-legend__grid">
          {FAMILIES.map((family) => {
            // Sans filtre actif, toutes les familles sont visibles : toutes « pressées ».
            const pressed = !filtering || activeSet.has(family);
            return (
              <li key={family}>
                <button
                  type="button"
                  className="map-legend__row"
                  data-family={family}
                  aria-pressed={pressed}
                  title={`${FAMILY_LABEL[family]} — ${(counts?.[family] ?? 0).toLocaleString("fr-FR")}`}
                  onClick={() => onToggle?.(family)}
                >
                  <span className="map-legend__swatch" aria-hidden="true" />
                  <span className="map-legend__label">{FAMILY_LABEL[family]}</span>
                  <span className="map-legend__count">{(counts?.[family] ?? 0).toLocaleString("fr-FR")}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="map-legend__group">
        <div className="micro">organisations</div>
        <ul className="map-legend__grid">
          {ORG_KINDS.map((kind) => (
            <li key={kind.key} className="map-legend__row" data-kind={kind.key}>
              <span className="map-legend__swatch" aria-hidden="true" />
              <span className="map-legend__label">{kind.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="map-legend__sev">
        <span className="micro">sévérité</span>
        {SEVERITY_RAMP.map((step) => (
          <span key={step.label} className="pip" style={{ background: step.color }} title={step.label} />
        ))}
      </div>
    </div>
  );
}
