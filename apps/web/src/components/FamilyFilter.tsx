import type { FeedProps } from "../contracts";
import "./feed.css";
import { Button } from "@astryxdesign/core/Button";

type FamilyFilterProps = Pick<FeedProps, "byFamily" | "family" | "onFamily">;

export default function FamilyFilter({ byFamily, family, onFamily }: FamilyFilterProps) {
  return (
    <div className="family-filter" role="group" aria-label="Filter by family">
      <span className="family-filter__label">family</span>
      <Button
        label="All"
        className="family-filter__btn"
        size="sm"
        variant={family === null ? "primary" : "secondary"}
        aria-pressed={family === null}
        onClick={() => onFamily(null)}
      >
        <span>All</span>
      </Button>
      {byFamily.map(({ family: name, n }) => (
        <Button
          key={name}
          label={name}
          className="family-filter__btn"
          size="sm"
          variant={family === name ? "primary" : "secondary"}
          aria-pressed={family === name}
          onClick={() => onFamily(name)}
        >
          <span>{name}</span>
          <span className="family-filter__count" role="status" aria-live="polite">{n}</span>
        </Button>
      ))}
    </div>
  );
}
