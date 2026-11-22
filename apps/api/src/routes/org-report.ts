import type { FastifyInstance } from "fastify";
import { notFound } from "../errors.js";
import { buildOrgReport, countPdfPages, renderOrgReportPdf } from "../report/org-report.js";
import { loadOrgReportInput } from "../report/org-report-data.js";

/** One downloadable ten-page PDF for any organisation id in the referential. */
export default async function (app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/orgs/:id/report.pdf", async (req, reply) => {
    const rawId = req.params.id;
    if (!/^\d+$/.test(rawId)) throw notFound();
    const input = await loadOrgReportInput(Number(rawId));
    if (!input) throw notFound();
    const report = buildOrgReport(input);
    const pdf = renderOrgReportPdf(report);
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="organisation-${report.orgId}-rapport.pdf"`);
    reply.header("X-Report-Pages", String(countPdfPages(pdf)));
    return pdf;
  });
}
