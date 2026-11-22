/**
 * Deterministic, dependency-free ten-page PDF report for one organisation.
 *
 * Every page is rendered from aggregates only. Event titles, claim text,
 * source URLs and asset values never enter the document: the report cannot
 * leak a victim's personal data even when the underlying source is a grey
 * source. The layout and the object writer are pure functions so the same
 * code can be used by the HTTP route and by the exhaustive measurement.
 */

export const REPORT_PAGE_COUNT = 10;

export const REPORT_PAGE_TITLES = [
  "1. Identité et périmètre",
  "2. Empreinte numérique",
  "3. Événements enregistrés",
  "4. Chronologie sur douze mois",
  "5. Sources et provenance",
  "6. Revendications",
  "7. Exposition et actifs",
  "8. Liens et dépendances",
  "9. Limites et conformité",
  "10. Méthode et reproductibilité",
] as const;

export type CountItem = { label: string; count: number };

export type OrgReportInput = {
  org: {
    id: number;
    name: string;
    kind: string;
    sector: string | null;
    city: string | null;
    dept: string | null;
    domain: string | null;
    createdAt: string;
    status: string;
    parentId: number | null;
  };
  generatedAt: string;
  aliases: number;
  events: {
    total: number;
    regional: number;
    exposure: number;
    byFamily: CountItem[];
    byMonth: CountItem[];
    lastObservedAt: string | null;
  };
  assets: { total: number; byKind: CountItem[] };
  sources: { total: number; na: number; gray: number; used: number; byFamily: CountItem[] };
  claims: number;
  relations: { parents: number; children: number };
  baseline: { orgs: number; sources: number; events: number };
};

export type ReportPage = { title: string; lines: string[] };
export type OrgReport = { orgId: number; orgName: string; generatedAt: string; pages: ReportPage[] };

/** French grouping without `Intl` (called millions of times by the measurement). */
export function formatCount(n: number): string {
  const s = String(Math.max(0, Math.trunc(n)));
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += " ";
    out += s[i];
  }
  return out;
}

function field(label: string, value: string | number | null): string {
  return `${label} : ${value === null || value === "" ? "non renseigné" : value}`;
}

function counts(items: CountItem[], empty: string): string {
  if (items.length === 0) return empty;
  return items.map((item) => `${item.label} ${formatCount(item.count)}`).join(" · ");
}

/**
 * Builds the ten pages. No database call, no clock read, no random value:
 * the same input always yields the same pages.
 */
export function buildOrgReport(input: OrgReportInput): OrgReport {
  const { org, events, assets, sources } = input;
  const dept = org.dept && NA_DEPARTMENTS[org.dept] === true
    ? `${org.dept} (Nouvelle-Aquitaine)`
    : org.dept ?? "non renseigné";
  const pages: ReportPage[] = [
    {
      title: REPORT_PAGE_TITLES[0],
      lines: [
        field("Organisation", org.name),
        field("Identifiant radar", org.id),
        field("Type", org.kind),
        field("Secteur", org.sector),
        field("Ville", org.city),
        field("Département", dept),
        field("Statut", org.status),
        field("Création dans le référentiel", org.createdAt.slice(0, 10)),
        field("Alias actifs", formatCount(input.aliases)),
      ],
    },
    {
      title: REPORT_PAGE_TITLES[1],
      lines: [
        field("Domaine déclaré", org.domain),
        field("Actifs numériques", formatCount(assets.total)),
        counts(assets.byKind, "Aucun type d'actif enregistré"),
        field("Organisation mère déclarée", org.parentId === null ? null : org.parentId),
        "Seuls les types et les volumes sont publiés, jamais les valeurs d'actifs.",
      ],
    },
    {
      title: REPORT_PAGE_TITLES[2],
      lines: [
        field("Événements rattachés", formatCount(events.total)),
        field("Événements de portée régionale", formatCount(events.regional)),
        field("Événements d'exposition ou de vulnérabilité", formatCount(events.exposure)),
        counts(events.byFamily, "Aucune famille d'événement enregistrée"),
        field("Dernière observation", events.lastObservedAt?.slice(0, 10) ?? null),
        "Les titres et résumés d'événements ne sont pas reproduits.",
      ],
    },
    {
      title: REPORT_PAGE_TITLES[3],
      lines: [
        "Série mensuelle des événements observés (douze derniers mois) :",
        ...events.byMonth.map((m) => `- ${m.label} : ${formatCount(m.count)}`),
      ],
    },
    {
      title: REPORT_PAGE_TITLES[4],
      lines: [
        field("Sources du corpus", formatCount(sources.total)),
        field("Sources de Nouvelle-Aquitaine", formatCount(sources.na)),
        field("Sources grises conservées", formatCount(sources.gray)),
        field("Sources ayant produit un fait pour cette organisation", formatCount(sources.used)),
        counts(sources.byFamily, "Aucune famille de source associée"),
        "Les sources grises sont autorisées ; aucune URL de source n'est publiée ici.",
      ],
    },
    {
      title: REPORT_PAGE_TITLES[5],
      lines: [
        field("Indices de revendication rattachés", formatCount(input.claims)),
        "Aucun libellé libre, nom de victime ou extrait brut n'est repris.",
        "Les indices restent des signaux : ils ne fondent pas une attribution.",
      ],
    },
    {
      title: REPORT_PAGE_TITLES[6],
      lines: [
        field("Actifs suivis", formatCount(assets.total)),
        counts(assets.byKind, "Aucun actif suivi"),
        field("Événements d'exposition", formatCount(events.exposure)),
        "Les adresses IP, noms d'hôte et certificats ne sont pas détaillés.",
      ],
    },
    {
      title: REPORT_PAGE_TITLES[7],
      lines: [
        field("Organisations mères", formatCount(input.relations.parents)),
        field("Organisations filles ou établissements", formatCount(input.relations.children)),
        "Les liens sont établis à partir de preuves publiques tracées en base.",
      ],
    },
    {
      title: REPORT_PAGE_TITLES[8],
      lines: [
        "Périmètre géographique : Nouvelle-Aquitaine, douze départements.",
        "Sources grises autorisées, sans filtre de respectabilité éditoriale.",
        "Aucune donnée personnelle de victime n'est collectée ni diffusée.",
        "Aucun service payant n'est utilisé pour produire ce rapport.",
        "Les chiffres nuls sont écrits explicitement : rien n'est estimé.",
      ],
    },
    {
      title: REPORT_PAGE_TITLES[9],
      lines: [
        "Référentiel : toutes les organisations valides de la base radar.",
        field("Organisations éligibles", formatCount(input.baseline.orgs)),
        field("Sources au moment de la mesure", formatCount(input.baseline.sources)),
        field("Événements au moment de la mesure", formatCount(input.baseline.events)),
        "Commande reproductible : tsx scripts/measure-org-reports.mts",
        field("Généré le", input.generatedAt.slice(0, 19).replace("T", " ")),
      ],
    },
  ];
  return { orgId: org.id, orgName: org.name, generatedAt: input.generatedAt, pages };
}

/** NA departments: static lookup used to label the scope of a report. */
export const NA_DEPARTMENTS: Readonly<Record<string, true>> = {
  "16": true, "17": true, "19": true, "23": true, "24": true,
  "33": true, "40": true, "47": true, "64": true, "79": true,
  "86": true, "87": true,
};

/** Escapes a string for a PDF literal and keeps French accents (WinAnsi). */
function pdfText(value: string): string {
  let out = "";
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 63;
    if (ch === "(" || ch === ")" || ch === "\\") out += `\\${ch}`;
    else if (cp >= 32 && cp <= 255) out += ch;
    else if (cp === 0x2018 || cp === 0x2019) out += "'";
    else if (cp === 0x2013 || cp === 0x2014) out += "-";
    else if (cp === 0x202f || cp === 0x00a0) out += " ";
    else out += "?";
  }
  return out;
}

/**
 * Writes a PDF 1.4 file with exactly one page object per report page.
 * Helvetica and Helvetica-Bold with WinAnsiEncoding are base fonts: no font
 * file is embedded and no external service is contacted.
 */
export function renderOrgReportPdf(report: OrgReport): Buffer {
  const chunks: Buffer[] = [];
  let length = 0;
  const push = (text: string): void => {
    const buf = Buffer.from(text, "latin1");
    chunks.push(buf);
    length += buf.length;
  };
  const offsets: number[] = [0];

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const startObject = (id: number): void => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
  };
  const endObject = (): void => push("endobj\n");

  const totalObjects = 4 + report.pages.length * 2;
  const kids = report.pages.map((_, i) => `${5 + 2 * i} 0 R`).join(" ");

  startObject(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\n");
  endObject();

  startObject(2);
  push(`<< /Type /Pages /Kids [${kids}] /Count ${report.pages.length} >>\n`);
  endObject();

  startObject(3);
  push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n");
  endObject();

  startObject(4);
  push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\n");
  endObject();

  report.pages.forEach((page, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    startObject(pageId);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>\n`,
    );
    endObject();

    const lines = [
      `BT\n/F2 13 Tf\n48 794 Td\n(${pdfText(page.title)}) Tj\n/F1 10 Tf\n14 TL\n`,
      ...page.lines.map((line) => `T*\n(${pdfText(line)}) Tj\n`),
      "ET\n",
    ].join("");
    startObject(contentId);
    push(`<< /Length ${Buffer.byteLength(lines, "latin1")} >>\nstream\n${lines}endstream\n`);
    endObject();
  });

  const xref = length;
  push(`xref\n0 ${totalObjects}\n0000000000 65535 f \n`);
  for (let id = 1; id < totalObjects; id++) {
    push(`${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks, length);
}

/** Reads the page-tree count from a generated PDF (used by tests and the measurement). */
export function countPdfPages(pdf: Buffer): number {
  const match = /\/Count\s+(\d+)/.exec(pdf.toString("latin1"));
  return match ? Number(match[1]) : 0;
}
