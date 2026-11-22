/**
 * English panel showing the measured number of Nouvelle-Aquitaine facts with
 * a verifiable WARC proof. Values come only from GET /api/warc/proofs.
 */
import { useEffect, useState } from "react";
import { api, type WarcProofStats } from "../api";
import { formatCount, formatPercent } from "./CorpusView";
import "./corpus.css";

export default function WarcProofCard() {
  const [stats, setStats] = useState<WarcProofStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api.warcProofs(controller.signal)
      .then(setStats)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(String(reason));
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="corpus__panel" aria-labelledby="warc-proof-title" data-testid="warc-proof-card">
      <div className="corpus__panel-head">
        <h2 id="warc-proof-title">Facts with an archivable proof</h2>
        <span className="corpus__panel-meta">{stats?.scope ?? "Nouvelle-Aquitaine"}</span>
      </div>
      {error ? (
        <p className="corpus__empty" role="alert">Could not load WARC proof statistics.</p>
      ) : stats === null ? (
        <p className="corpus__empty" role="status">Loading WARC proof statistics…</p>
      ) : (
        <>
          <div className="corpus__gauge-value">
            {formatPercent(stats.coveragePercent)}
          </div>
          <p className="corpus__gauge-caption">
            <strong>{formatCount(stats.factsWithArchivableProof)}</strong> of {formatCount(stats.target)} eligible
            facts carry a verified WARC response record.
          </p>
          <p className="corpus__note">
            A fact counts only when its stored WARC record, block digest and payload digest all verify and its
            source is in Nouvelle-Aquitaine. Victim personal data is stripped before capture; no paid service is
            used. Archive: {formatCount(stats.warcFiles)} file(s), {formatCount(stats.warcBytes)} bytes.
          </p>
        </>
      )}
    </section>
  );
}
