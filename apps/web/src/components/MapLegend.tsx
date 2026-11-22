import { FAMILY_COLORS, FAMILY_COLOR_FALLBACK, FAMILY_LABELS } from "../map/Map3D";

/**
 * Légende de la carte : sans elle, une couleur ne se décode pas et la carte
 * n'est qu'une image. Elle reprend exactement la palette utilisée par les
 * couches MapLibre (`FAMILY_COLORS`), donc elle ne peut pas mentir.
 */
const SEVERITES: { n: number; label: string }[] = [
  { n: 1, label: "veille" },
  { n: 2, label: "faible" },
  { n: 3, label: "modérée" },
  { n: 4, label: "élevée" },
  { n: 5, label: "critique" },
];

export function MapLegend({ families }: { families: readonly string[] }) {
  const visibles = [...new Set(families)].filter(Boolean);
  return (
    <div className="map-legend" aria-label="Légende de la carte">
      <p className="map-legend__title">Sévérité</p>
      <ul className="map-legend__sev">
        {SEVERITES.map(({ n, label }) => (
          <li key={n}>
            <span className="map-legend__dot" style={{ background: `var(--sev-${n})` }} aria-hidden="true" />
            {n} · {label}
          </li>
        ))}
      </ul>

      {visibles.length > 0 ? (
        <>
          <p className="map-legend__title">Familles affichées</p>
          <ul className="map-legend__fam">
            {visibles.map((f) => (
              <li key={f}>
                <span
                  className="map-legend__chip"
                  style={{ background: FAMILY_COLORS[f] ?? FAMILY_COLOR_FALLBACK }}
                  aria-hidden="true"
                />
                {FAMILY_LABELS[f] ?? f}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export default MapLegend;
