import { useMemo, type CSSProperties } from "react";
import type { GraphLink, GraphNode } from "../graph/graphModel";
import { EmptyState, LoadingSkeleton } from "./Skeleton";
import "./graphmatrix.css";
import { Card } from "@astryxdesign/core/Card";
import { Table } from "@astryxdesign/core/Table";


type Props = {
  nodes: readonly GraphNode[];
  links: readonly GraphLink[];
  /** Chargement du graphe par le parent. */
  loading?: boolean;
  /** Relance le chargement depuis un état vide. */
  onRetry?: () => void;
};

/** Cell key: family then department, separated by NUL (absent from labels). */
const cellKey = (family: string, dept: string) => `${family}\u0000${dept}`;

const byTotalThenLabel = (a: { label: string; total: number }, b: { label: string; total: number }) =>
  b.total - a.total || a.label.localeCompare(b.label, "fr");

/**
 * Two safe background bands, each paired with a text colour that keeps the
 * count readable (>= 4.5:1): pale tint + light ink, or saturated tint + dark
 * ink. A continuous ramp would cross the mid-luminance gap where neither
 * --text nor --accent-ink reaches 4.5:1 on the dark surface.
 */
const cellTone = (ratio: number) =>
  ratio >= 0.5
    ? { intensity: 0.7 + ratio * 0.3, className: "gm-cell gm-cell--strong" }
    : { intensity: 0.18 + ratio * 0.24, className: "gm-cell" };

/**
 * Family × department matrix built from the graph: `rattache` (org → dept)
 * gives the column, `has_event` / `mentions` (org → family) gives the row.
 * Each organisation increments at most once per (family, department) pair.
 */
export default function GraphMatrix({ nodes, links, loading = false, onRetry }: Props) {
  const matrix = useMemo(() => {
    const nodeById = new Map<string, GraphNode>();
    for (const node of nodes) nodeById.set(node.id, node);

    const deptsOfOrg = new Map<string, Set<string>>();
    const familiesOfOrg = new Map<string, Set<string>>();

    const push = (map: Map<string, Set<string>>, id: string, label: string) => {
      const set = map.get(id);
      if (set) set.add(label);
      else map.set(id, new Set([label]));
    };

    for (const link of links) {
      const source = nodeById.get(link.source);
      const target = nodeById.get(link.target);
      if (!source || !target) continue;

      let org: GraphNode;
      let other: GraphNode;
      if (source.kind === "org") {
        org = source;
        other = target;
      } else if (target.kind === "org") {
        org = target;
        other = source;
      } else {
        continue;
      }

      if (link.type === "rattache" && other.kind === "dept") {
        push(deptsOfOrg, org.id, other.label);
      } else if ((link.type === "has_event" || link.type === "mentions") && other.kind === "family") {
        push(familiesOfOrg, org.id, other.label);
      }
    }

    const counts = new Map<string, number>();
    const deptTotals = new Map<string, number>();
    const familyTotals = new Map<string, number>();
    let contributingOrgs = 0;
    let max = 0;

    for (const [orgId, depts] of deptsOfOrg) {
      const families = familiesOfOrg.get(orgId);
      if (!families || families.size === 0 || depts.size === 0) continue;
      contributingOrgs += 1;
      for (const dept of depts) {
        for (const family of families) {
          const key = cellKey(family, dept);
          const next = (counts.get(key) ?? 0) + 1;
          counts.set(key, next);
          deptTotals.set(dept, (deptTotals.get(dept) ?? 0) + 1);
          familyTotals.set(family, (familyTotals.get(family) ?? 0) + 1);
          if (next > max) max = next;
        }
      }
    }

    const columns = [...deptTotals].map(([label, total]) => ({ label, total })).sort(byTotalThenLabel);
    const rows = [...familyTotals].map(([label, total]) => ({ label, total })).sort(byTotalThenLabel);

    return { counts, columns, rows, max, contributingOrgs };
  }, [nodes, links]);

  const { counts, columns, rows, max, contributingOrgs } = matrix;
  const summary = (
    <p className="gm-summary" role="status" aria-live="polite">
      <b>{contributingOrgs}</b> organisations · <b>{columns.length}</b> départements ·{" "}
      <b>{rows.length}</b> familles
    </p>
  );

  if (loading && nodes.length === 0) {
    return (
      <div className="gm-root">
        <LoadingSkeleton label="chargement du graphe…" />
      </div>
    );
  }

  if (columns.length === 0 || rows.length === 0) {
    return (
      <div className="gm-root">
        {summary}
        {onRetry ? (
          <EmptyState
            message="Aucune corrélation famille × département sur la période."
            actionLabel="Recharger le graphe"
            onAction={onRetry}
          />
        ) : (
          <p className="gm-empty">Aucune corrélation famille × département sur la période.</p>
        )}
      </div>
    );
  }

  return (
    <Card variant="transparent" padding={0} className="gm-root">
      {summary}
      <div className="gm-legend" aria-label="Lecture de la matrice">
        <span className="gm-legend-title">Lecture</span>
        <span className="gm-legend-text">intensité = organisations par case</span>
        <span className="gm-legend-scale" aria-hidden="true">
          {[0.18, 0.3, 0.85, 1].map((intensity) => (
            <span
              key={intensity}
              className="gm-swatch"
              style={{ "--gm-i": intensity } as CSSProperties}
            />
          ))}
        </span>
        <span className="gm-legend-text">0 → {max}</span>
        <span className="gm-legend-text">totaux dans les en-têtes de ligne et de colonne</span>
      </div>
      <div className="gm-scroll">
        <Table className="gm-table" aria-label="Organisations par famille et département" density="compact" dividers="rows">
          <thead>
            <tr>
              <th scope="col" className="gm-corner">
                Famille · Département
              </th>
              {columns.map((column) => (
                <th key={column.label} scope="col" className="gm-col" title={`${column.label} · ${column.total}`}>
                  {column.label}
                  <span className="gm-total" aria-hidden="true">{column.total}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="gm-row" title={`${row.label} · ${row.total}`}>
                  {row.label}
                  <span className="gm-total" aria-hidden="true">{row.total}</span>
                </th>
                {columns.map((column) => {
                  const count = counts.get(cellKey(row.label, column.label)) ?? 0;
                  if (count === 0) {
                    return <td key={column.label} className="gm-cell gm-cell--zero" />;
                  }
                  const tone = cellTone(count / max);
                  return (
                    <td
                      key={column.label}
                      className={tone.className}
                      style={{ "--gm-i": tone.intensity.toFixed(3) } as CSSProperties}
                      title={`${row.label} · ${column.label}: ${count}`}
                    >
                      {count}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}
