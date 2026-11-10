import { Statistic, Tag } from "antd";

export interface KpiItem {
  label: string;
  value: number | string;
  state?: string;
  live?: boolean;
}

export interface KpiBandProps {
  items: KpiItem[];
  className?: string;
}

export default function KpiBand({ items, className }: KpiBandProps) {
  return (
    <div className={className} style={{ display: "flex", gap: 16, padding: "8px 16px", flexWrap: "wrap" }}>
      {items.map((item, index) => (
        <Statistic
          key={`${item.label}-${index}`}
          title={item.label}
          value={item.value}
          valueStyle={{ fontFamily: "monospace" }}
          suffix={item.state ? <Tag>{item.state}</Tag> : undefined}
        />
      ))}
    </div>
  );
}