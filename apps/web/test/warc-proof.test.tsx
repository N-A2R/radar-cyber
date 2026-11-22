// @vitest-environment jsdom
/**
 * Behavior: the English WARC proof panel publishes the measured counters and
 * keeps an explicit failure state when the API cannot be read.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import WarcProofCard from "../src/components/WarcProofCard";
import type { WarcProofStats } from "../src/api";

const { warcProofs } = vi.hoisted(() => ({ warcProofs: vi.fn() }));
vi.mock("../src/api", () => ({ api: { warcProofs } }));

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

const stats: WarcProofStats = {
  scope: "Nouvelle-Aquitaine",
  definition: "a NA fact whose WARC response record and hashes are verified on disk",
  eligibleFacts: 271,
  factsWithArchivableProof: 271,
  target: 271,
  coveragePercent: 100,
  warcFiles: 1,
  warcBytes: 78_669_419,
  invalidProofs: 0,
  recent: [],
  generatedAt: "2026-11-22T00:00:00.000Z",
};

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  warcProofs.mockReset();
});

async function render(): Promise<string> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root!.render(<WarcProofCard />); });
  return host.textContent ?? "";
}

it("shows the measured English counters without archived bodies", async () => {
  warcProofs.mockResolvedValue(stats);
  const text = await render();
  expect(warcProofs).toHaveBeenCalledTimes(1);
  expect(text).toContain("Facts with an archivable proof");
  expect(text).toContain("Nouvelle-Aquitaine");
  expect(text).toContain("100.0%");
  expect(text).toContain("271");
  expect(text).toContain("1 file(s)");
  expect(text).not.toMatch(/@|<html|victime|preuve archivable/i);
});

it("reports a failed API read instead of showing a stale count", async () => {
  warcProofs.mockRejectedValue(new Error("offline"));
  const text = await render();
  expect(text).toContain("Could not load WARC proof statistics.");
  expect(text).not.toContain("271");
});
