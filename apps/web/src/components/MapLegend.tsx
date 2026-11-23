import { FAMILY_HEX, FAMILY_HEX_FALLBACK } from "../map/arcs";
import { FAMILY_LABELS } from "../map/libelles";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";

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
    <Card variant="transparent" className="map-legend" aria-label="Légende de la carte">
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
                  style={{ background: FAMILY_HEX[f] ?? FAMILY_HEX_FALLBACK }}
                  aria-hidden="true"
                />
                <Badge label={FAMILY_LABELS[f] ?? f} variant="neutral" />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}

export default MapLegend;
