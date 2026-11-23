import type { FeedProps } from "../contracts";
import "./feed.css";

type FamilyFilterProps = Pick<FeedProps, "byFamily" | "family" | "onFamily">;

export default function FamilyFilter({ byFamily, family, onFamily }: FamilyFilterProps) {
  return (
    <div className="family-filter" role="group" aria-label="Filter by family">
      <span className="family-filter__label">family</span>
      <button
        type="button"
        className="family-filter__btn"
        aria-pressed={family === null}
        onClick={() => onFamily(null)}
      >
        <span>All</span>
      </button>
      {byFamily.map(({ family: name, n }) => (
        <button
          key={name}
          type="button"
          className="family-filter__btn"
          aria-pressed={family === name}
          onClick={() => onFamily(name)}
        >
          <span>{name}</span>
          <span className="family-filter__count" role="status" aria-live="polite">{n}</span>
        </button>
      ))}
    </div>
  );
}
