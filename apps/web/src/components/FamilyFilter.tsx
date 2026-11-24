import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import type { FeedProps } from "../contracts";
import "./feed.css";

type FamilyFilterProps = Pick<FeedProps, "byFamily" | "family" | "onFamily">;

const ALL = "all";
const FAMILY_PREFIX = "family:";

export default function FamilyFilter({ byFamily, family, onFamily }: FamilyFilterProps) {
  return (
    <div className="family-filter">
      <SegmentedControl
        label="Filtrer par famille"
        size="sm"
        value={family === null ? ALL : `${FAMILY_PREFIX}${family}`}
        onChange={(value) => {
          onFamily(value === ALL ? null : value.slice(FAMILY_PREFIX.length));
        }}
      >
        <SegmentedControlItem value={ALL} label="Tout" />
        {byFamily.map(({ family: name, n }) => (
          <SegmentedControlItem
            key={name}
            value={`${FAMILY_PREFIX}${name}`}
            label={`${name} (${n})`}
          />
        ))}
      </SegmentedControl>
    </div>
  );
}
