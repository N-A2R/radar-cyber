/**
 * One export control for the whole shell, fed by the screen currently mounted.
 * Screens publish their own rows through `useScreenExport`; the rail reads the
 * registry, so every screen offers the same two formats without duplicating UI.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ViewKey } from "../contracts";
import {
  downloadBlob, exportFilename, EXPORT_TITLES, prepareRows, toCsv, toPdfBlob,
  type DataRow, type ExportFormat,
} from "../export";

type Snapshot = { view: ViewKey; title: string; rows: DataRow[] };
const PublishContext = createContext<((snapshot: Snapshot) => void) | null>(null);
const SnapshotContext = createContext<Snapshot | null>(null);

export function ExportProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  return (
    <PublishContext.Provider value={setSnapshot}>
      <SnapshotContext.Provider value={snapshot}>{children}</SnapshotContext.Provider>
    </PublishContext.Provider>
  );
}

/**
 * Publish the data a screen actually displays. The signature keeps a stable
 * effect dependency even when a parent rebuilds its row array on each render.
 */
export function useScreenExport(
  view: ViewKey,
  rows: DataRow[],
  enabled = true,
  title: string = EXPORT_TITLES[view],
): void {
  const publish = useContext(PublishContext);
  const latest = useRef(rows);
  latest.current = rows;
  const signature = JSON.stringify(enabled ? rows : []);
  useEffect(() => {
    if (enabled && publish) publish({ view, title, rows: latest.current });
  }, [publish, view, title, enabled, signature]);
}

export default function ExportMenu() {
  const snapshot = useContext(SnapshotContext);
  const [status, setStatus] = useState<string | null>(null);

  const save = (format: ExportFormat) => {
    if (!snapshot) {
      setStatus("No screen data available yet.");
      return;
    }
    const rows = prepareRows(snapshot.view, snapshot.rows);
    const filename = exportFilename(snapshot.view, format);
    if (format === "csv") {
      downloadBlob(new Blob([toCsv(snapshot.view, rows)], { type: "text/csv;charset=utf-8" }), filename);
    } else {
      downloadBlob(toPdfBlob(snapshot.view, snapshot.title, rows), filename);
    }
    setStatus(`${filename} — ${rows.length} rows`);
  };

  return (
    <div className="export" role="group" aria-label="Export current screen">
      <span className="export__label">Export</span>
      <button type="button" className="export__format" onClick={() => save("csv")}>CSV</button>
      <button type="button" className="export__format" onClick={() => save("pdf")}>PDF</button>
      {status ? <span className="export__status" role="status">{status}</span> : null}
    </div>
  );
}
