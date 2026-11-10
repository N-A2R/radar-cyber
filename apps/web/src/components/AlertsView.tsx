import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert as AntAlert,
  Button,
  Drawer,
  Empty,
  Segmented,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { api, type Alert as AlertRow, type AlertStatus } from "../api";
import { t } from "../i18n";

const { Text, Title } = Typography;

/** Sévérité S1 → S5 (S1 la plus basse). */
const SEVERITY_COLOR: Record<number, string> = {
  1: "#5b6472",
  2: "#4a90d9",
  3: "#e0b341",
  4: "#e8833a",
  5: "#e0483c",
};

const STATUS_COLOR: Record<AlertStatus, string> = {
  open: "#e0483c",
  ack: "#e0b341",
  resolved: "#22c55e",
};

type SeverityFilter = "all" | "5" | "4" | "3" | "2" | "1";

function severityTag(severity: number): string {
  return SEVERITY_COLOR[severity] ?? "#5b6472";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Bloc « enrichissement » : whois, DNS, certificats, reverse. */
function EnrichmentBlock({ id, kind }: { id: number; kind: "indicator" | "event" }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const call = kind === "indicator" ? api.enrichIndicator(id) : api.enrichEvent(id);
    call
      .then((res) => { if (!cancelled) setData(res as unknown as Record<string, unknown>) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) });
    return () => { cancelled = true };
  }, [id, kind]);

  if (loading) return <Spin size="small" />;
  if (error) return <AntAlert type="error" message={error} showIcon />;

  const rows: Array<[string, string]> = [];
  const enrichment = (data?.enrichment ?? {}) as Record<string, unknown>;

  const domain = enrichment.domain as Record<string, unknown> | null | undefined;
  if (domain) {
    rows.push(["registrar", String(domain.registrar ?? "—")]);
    rows.push(["created", String(domain.created ?? "—")]);
    rows.push(["expires", String(domain.expires ?? "—")]);
    if (Array.isArray(domain.nameServers) && domain.nameServers.length) {
      rows.push(["name servers", domain.nameServers.map(String).join(", ")]);
    }
  }
  const dns = enrichment.dns as Record<string, unknown> | null | undefined;
  if (dns) {
    const a = Array.isArray(dns.a) ? dns.a.map(String) : [];
    const aaaa = Array.isArray(dns.aaaa) ? dns.aaaa.map(String) : [];
    if (a.length) rows.push(["A", a.join(", ")]);
    if (aaaa.length) rows.push(["AAAA", aaaa.join(", ")]);
  }
  const certs = enrichment.certs as Array<Record<string, unknown>> | null | undefined;
  if (Array.isArray(certs) && certs.length) {
    rows.push(["certificates", String(certs.length)]);
    for (const c of certs.slice(0, 3)) {
      rows.push([String(c.name ?? ""), `${String(c.issuer ?? "")} · ${String(c.notAfter ?? "")}`]);
    }
  }
  const reverse = enrichment.reverse as string[] | null | undefined;
  if (Array.isArray(reverse) && reverse.length) rows.push(["PTR", reverse.join(", ")]);

  const errors = (enrichment.errors as string[] | undefined) ?? [];
  const score = typeof data?.score === "number" ? data.score : null;

  return (
    <Space direction="vertical" size="small" style={{ width: "100%" }}>
      {score != null && <Text strong>score {score}/100</Text>}
      {rows.map(([k, v]) => (
        <div key={k}>
          <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase" }}>{k}</Text>
          <div style={{ fontSize: 12, wordBreak: "break-all" }}>{v}</div>
        </div>
      ))}
      {errors.length > 0 && (
        <AntAlert type="warning" showIcon message={errors.join(" · ")} />
      )}
      {!rows.length && !errors.length && <Empty description="no enrichment" />}
    </Space>
  );
}

export default function AlertsView() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [stats, setStats] = useState<Array<{ status: AlertStatus; severity: number; count: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"all" | AlertStatus>("all");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [drawer, setDrawer] = useState<{ id: number; kind: "indicator" | "event"; title: string } | null>(null);


  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, st] = await Promise.all([
        api.alerts({
          status: status === "all" ? undefined : status,
          severity: severity === "all" ? undefined : Number(severity),
        }),
        api.alertStats(),
      ]);
      setAlerts(rows);
      setStats(st);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [status, severity]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<AlertStatus, number> = { open: 0, ack: 0, resolved: 0 };
    for (const row of stats) c[row.status] += Number(row.count);
    return c;
  }, [stats]);

  const act = useCallback(async (id: number, action: "ack" | "resolve") => {
    try {
      if (action === "ack") await api.ackAlert(id);
      else await api.resolveAlert(id);
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status: action === "ack" ? "ack" : "resolved" } : a)));
    } catch {
      // 401 sans session : l'action reste visible mais échoue proprement.
      setError("authentication required");
    }
  }, []);

  const columns: ColumnsType<AlertRow> = [
    {
      title: t("alerts.severity"),
      dataIndex: "severity",
      width: 90,
      sorter: (a, b) => a.severity - b.severity,
      defaultSortOrder: "descend",
      render: (s: number) => <Tag color={severityTag(s)}>S{s}</Tag>,
    },
    {
      title: t("alerts.title"),
      dataIndex: "title",
      width: 320,
      render: (_: string, row) => (
        <Space direction="vertical" size={0}>
          <Text strong>{row.title}</Text>
          <Text type="secondary" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{row.rule_id}</Text>
        </Space>
      ),
    },
    {
      title: t("alerts.event"),
      dataIndex: "event_title",
      render: (v: string | null) => v ?? "—",
    },
    {
      title: t("alerts.org"),
      dataIndex: "org_name",
      width: 160,
      render: (v: string | null) => v ?? "—",
    },
    {
      title: t("alerts.date"),
      dataIndex: "created_at",
      width: 140,
      sorter: (a, b) => a.created_at.localeCompare(b.created_at),
      render: (v: string) => formatDate(v),
    },
    {
      title: t("alerts.status"),
      dataIndex: "status",
      width: 100,
      render: (s: AlertStatus) => <Tag color={STATUS_COLOR[s]}>{s}</Tag>,
    },
    {
      title: "",
      width: 190,
      render: (_: unknown, row) => {
        const indicatorId = row.indicator_id;
        const eventId = row.event_id;
        return (
        <Space size={4}>
          {indicatorId != null && (
            <Button size="small" onClick={() => setDrawer({ id: indicatorId, kind: "indicator", title: row.title })}>
              {t("alerts.enrich")}
            </Button>
          )}
          {eventId != null && (
            <Button size="small" onClick={() => setDrawer({ id: eventId, kind: "event", title: row.title })}>
              {t("alerts.detail")}
            </Button>
          )}
          {row.status === "open" && (
            <Button size="small" onClick={() => void act(row.id, "ack")}>{t("alerts.ack")}</Button>
          )}
          {row.status !== "resolved" && (
            <Button size="small" type="primary" ghost onClick={() => void act(row.id, "resolve")}>
              {t("alerts.resolve")}
            </Button>
          )}
        </Space>
        );
      },
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space size="middle" wrap>
        <Segmented
          value={status}
          onChange={(v) => setStatus(v as "all" | AlertStatus)}
          options={[
            { label: `open ${counts.open}`, value: "open" },
            { label: `ack ${counts.ack}`, value: "ack" },
            { label: `resolved ${counts.resolved}`, value: "resolved" },
            { label: "all", value: "all" },
          ]}
        />
        <Segmented
          value={severity}
          onChange={(v) => setSeverity(v as SeverityFilter)}
          options={[
            { label: "S5", value: "5" },
            { label: "S4", value: "4" },
            { label: "S3", value: "3" },
            { label: "S2", value: "2" },
            { label: "all", value: "all" },
          ]}
        />
      </Space>

      {error && <AntAlert type="error" showIcon message={error} onClose={() => setError(null)} />}

      <Table<AlertRow>
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={alerts}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        locale={{ emptyText: loading ? <Spin size="small" /> : <Empty description={t("alerts.empty")} /> }}
      />

      <Drawer
        open={drawer != null}
        onClose={() => setDrawer(null)}
        title={drawer?.title ?? ""}
        width={420}
      >
        {drawer && <EnrichmentBlock id={drawer.id} kind={drawer.kind} />}
      </Drawer>
    </Space>
  );
}
