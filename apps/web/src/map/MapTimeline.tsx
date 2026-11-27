/**
 * Timeline scrubber for the map. It filters the events sent to Map3D by month;
 * counts on the bars come from the API, so the UI never guesses a total from
 * the (possibly truncated) page of points it received.
 */
import { useEffect, useState } from "react";
import { advanceBucket, formatBucketLabel } from "./timeline.js";
import type { MapTimelineBucket } from "./timeline.js";
import "./map-timeline.css";
import { Card } from "@astryxdesign/core/Card";

export interface MapTimelineProps {
  buckets: readonly MapTimelineBucket[];
  selected: string;
  shown: number;
  total: number;
  loading?: boolean;
  onSelect: (bucket: string) => void;
  /** Kept as a prop so playback can be tested without waiting a second. */
  tickMs?: number;
}

export default function MapTimeline({
  buckets, selected, shown, total, loading = false, onSelect, tickMs = 1100,
}: MapTimelineProps) {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const next = advanceBucket(buckets, selected);
      if (next === null) {
        setPlaying(false);
        return;
      }
      onSelect(next);
    }, tickMs);
    return () => clearInterval(timer);
  }, [playing, selected, buckets, onSelect, tickMs]);

  useEffect(() => {
    if (buckets.length === 0) setPlaying(false);
  }, [buckets.length]);

  const position = selected === "all"
    ? 0
    : Math.max(0, buckets.findIndex((bucket) => bucket.key === selected) + 1);
  const current = selected === "all" ? null : buckets.find((bucket) => bucket.key === selected);
  const count = current?.count ?? total;
  const maximum = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const change = (next: number) => {
    setPlaying(false);
    onSelect(next === 0 ? "all" : buckets[next - 1]?.key ?? "all");
  };

  return (
    <section className="map-timeline" aria-label="Map timeline">
      <Card variant="transparent" className="map-timeline__controls-card">
      <Card variant="transparent" padding={0} className="map-timeline__controls">
        <button
          type="button"
          className="map-timeline__play"
          onClick={() => {
            if (!playing && selected !== "all" && advanceBucket(buckets, selected) === null) {
              onSelect("all");
            }
            setPlaying(!playing);
          }}
          aria-label={playing ? "Pause timeline" : "Play timeline"}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <span className="map-timeline__status" aria-live="polite">
          <strong>{current ? formatBucketLabel(current.key) : "All dates"}</strong>
          <span>{count.toLocaleString("en-GB")} events</span>
          {shown < count ? <span className="map-timeline__cap">showing {shown.toLocaleString("en-GB")}</span> : null}
          {loading ? <span className="map-timeline__cap">loading…</span> : null}
        </span>
        <button
          type="button"
          className="map-timeline__reset"
          onClick={() => change(0)}
          aria-label="Show all dates"
          aria-pressed={selected === "all"}
        >
          All dates
        </button>
      </Card>
      </Card>
      <Card variant="transparent" padding={0} className="map-timeline__bars" role="group" aria-label="Choose a month">
        {buckets.map((bucket, index) => (
          <button
            key={bucket.key}
            type="button"
            className="map-timeline__bar-button"
            aria-label={`${formatBucketLabel(bucket.key)}: ${bucket.count} events`}
            aria-pressed={selected === bucket.key}
            onClick={() => change(index + 1)}
            title={`${formatBucketLabel(bucket.key)} — ${bucket.count} events`}
          >
            <span
              className="map-timeline__bar"
              style={{ height: `${Math.max(3, Math.round(bucket.count / maximum * 100))}%` }}
            />
          </button>
        ))}
      </Card>
      <input
        className="map-timeline__scrubber"
        type="range"
        min={0}
        max={Math.max(0, buckets.length)}
        step={1}
        value={position}
        onChange={(event) => change(Number(event.target.value))}
        aria-label="Timeline position"
      />
    </section>
  );
}
