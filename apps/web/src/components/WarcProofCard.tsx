/**
 * English panel showing the measured number of Nouvelle-Aquitaine facts with
 * a verifiable WARC proof. Values come only from GET /api/warc/proofs.
 */
import { useEffect, useId, useState } from "react";
import { api, type WarcProofStats } from "../api";
import { formatCount, formatPercent } from "./CorpusView";
import { formatDate, formatNumber } from "./SourcesView";
import "./corpus.css";
import { Card } from "@astryxdesign/core/Card";

/** Une preuve d'archive est affichée telle quelle : jamais recomposée ici. */
export type WarcProof = {
  recordId: string;
  targetUri: string;
  date: string;
  digest?: string | null;
  identifiedPayloadType?: string | null;
  blockLength?: number | null;
};

type ArchiveProofProps = {
  proof?: WarcProof | null;
};

/** Carte de traçabilité d'un enregistrement WARC fourni par le shell. */
export function ArchiveProofCard({ proof = null }: ArchiveProofProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `sws-warc-${uid}`;
  return (
    <section className="sws-warc" aria-labelledby={titleId}>
      <header className="sws-warc__head">
        <h2 id={titleId}>Preuve d’archive</h2>
        <span className="sws-warc__format">WARC</span>
      </header>
      {proof === null ? (
        <p className="sws-warc__empty" role="status">Aucune preuve d’archive jointe à cette vue.</p>
      ) : (
        <dl className="sws-warc__fields">
          <Card variant="transparent" padding={0}>
            <dt>Cible</dt>
            <dd>
              {/^https?:\/\//i.test(proof.targetUri) ? (
                <a href={proof.targetUri} target="_blank" rel="noopener noreferrer">
                  {proof.targetUri}
                </a>
              ) : (
                <span>{proof.targetUri}</span>
              )}
            </dd>
          </Card>
          <Card variant="transparent" padding={0}>
            <dt>Enregistrement</dt>
            <dd><code>{proof.recordId}</code></dd>
          </Card>
          <Card variant="transparent" padding={0}>
            <dt>Date de capture</dt>
            <dd><time dateTime={proof.date}>{formatDate(proof.date)}</time></dd>
          </Card>
          {proof.digest ? (
            <Card variant="transparent" padding={0}>
              <dt>Empreinte du bloc</dt>
              <dd><code>{proof.digest}</code></dd>
            </Card>
          ) : null}
          {proof.identifiedPayloadType ? (
            <Card variant="transparent" padding={0}>
              <dt>Type de contenu</dt>
              <dd>{proof.identifiedPayloadType}</dd>
            </Card>
          ) : null}
          {proof.blockLength !== null && proof.blockLength !== undefined ? (
            <Card variant="transparent" padding={0}>
              <dt>Taille du bloc</dt>
              <dd>{formatNumber(proof.blockLength)} octets</dd>
            </Card>
          ) : null}
        </dl>
      )}
    </section>
  );
}

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
    <Card variant="transparent" className="corpus__panel-card">
    <section className="corpus__panel" aria-labelledby="warc-proof-title" data-testid="warc-proof-card">
      <Card variant="transparent" padding={0} className="corpus__panel-head">
        <h2 id="warc-proof-title">Facts with an archivable proof</h2>
        <span className="corpus__panel-meta">{stats?.scope ?? "Nouvelle-Aquitaine"}</span>
      </Card>
      {error ? (
        <p className="corpus__empty" role="alert">Could not load WARC proof statistics.</p>
      ) : stats === null ? (
        <p className="corpus__empty" role="status">Loading WARC proof statistics…</p>
      ) : (
        <>
          <Card variant="transparent" padding={0} className="corpus__gauge-value">
            {formatPercent(stats.coveragePercent)}
          </Card>
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
    </Card>
  );
}
