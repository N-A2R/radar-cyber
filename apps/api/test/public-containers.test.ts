/** One behaviour per test: public NA repository and bucket detection. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countDataFiles,
  fingerprint,
  hasDataFile,
  hasNaDataMetadata,
  isNaDepartment,
  isPublicReadable,
  naSignal,
  parseContainerUrl,
} from "../src/public-containers/detect.js";
import {
  countAccessible,
  validateCorpus,
  type ContainerCorpus,
  type ContainerRecord,
} from "../src/public-containers/corpus.js";

function record(overrides: Partial<ContainerRecord> = {}): ContainerRecord {
  const base = {
    kind: "repository" as const,
    host: "github.com",
    name: "bordeaux-data",
    ownerHash: fingerprint("owner:example"),
    naSignal: "bordeaux",
    dataSignal: "data",
    dataFiles: 3,
    status: 200,
    origin: "github-search",
    checkedAt: "2026-11-22T03:00:00.000Z",
  };
  const value = { ...base, ...overrides };
  return { ...value, id: fingerprint(`${value.kind}:${value.host}:${value.ownerHash}:${value.name}`) };
}

function corpus(records: ContainerRecord[]): ContainerCorpus {
  return {
    collectedAt: "2026-11-22T03:00:00.000Z",
    scope: "nouvelle-aquitaine",
    method: "test",
    candidatesScanned: records.length,
    records,
  };
}

test("repository URLs are parsed and the owner handle is hashed", () => {
  const ref = parseContainerUrl("https://github.com/Acme-NA/bordeaux-data");
  assert.deepEqual(ref, {
    kind: "repository",
    host: "github.com",
    name: "bordeaux-data",
    ownerHash: fingerprint("owner:acme na"),
  });
  assert.ok(!ref?.ownerHash.includes("acme"));
});

test("gist and alternative code-host URLs are classified", () => {
  assert.equal(parseContainerUrl("https://gist.github.com/alice/abc123")?.kind, "gist");
  assert.equal(parseContainerUrl("https://gitlab.com/na-team/poitiers-data")?.host, "gitlab.com");
  assert.equal(parseContainerUrl("https://bitbucket.org/na-team/gironde-csv")?.kind, "repository");
});

test("object-storage URLs become buckets across providers", () => {
  assert.deepEqual(
    parseContainerUrl("https://na-datasets.s3.eu-west-3.amazonaws.com/")?.kind,
    "bucket",
  );
  assert.equal(parseContainerUrl("https://s3.amazonaws.com/na-datasets")?.host, "s3.amazonaws.com");
  assert.equal(parseContainerUrl("https://storage.googleapis.com/na-datasets")?.kind, "bucket");
  assert.equal(parseContainerUrl("https://na-data.blob.core.windows.net/open")?.kind, "bucket");
});

test("credentials, plain HTTP and unknown hosts are rejected", () => {
  for (const url of [
    "http://github.com/acme/bordeaux-data",
    "https://user:secret@github.com/acme/bordeaux-data",
    "https://evil.example.org/bordeaux-data",
    "not-a-url",
  ]) {
    assert.equal(parseContainerUrl(url), null, url);
  }
});

test("NA geography detection accepts the twelve departments and their cities", () => {
  for (const value of ["Nouvelle-Aquitaine", "Pyrénées-Atlantiques", "Bordeaux", "Poitiers"]) {
    assert.ok(naSignal(value).length > 0, value);
  }
  for (const value of ["Paris", "Lyon", "Marseille"]) assert.deepEqual(naSignal(value), []);
  for (const code of ["16", "33", "64", "87"]) assert.equal(isNaDepartment(code), true);
  assert.equal(isNaDepartment("75"), false);
});

test("data metadata requires an explicit data term next to the place", () => {
  assert.equal(hasNaDataMetadata("Données ouvertes de Bordeaux Métropole"), true);
  assert.equal(hasNaDataMetadata("Bordeaux, Nouvelle-Aquitaine"), false);
  assert.equal(hasNaDataMetadata("Open data Poitiers dataset"), true);
  assert.equal(hasNaDataMetadata("Paris data"), false);
});

test("data files are found by extension, not by source code names", () => {
  assert.equal(hasDataFile(["src/index.ts", "README.md", "package.json"]), false);
  assert.equal(hasDataFile(["src/index.ts", "README.md"]), false);
  assert.equal(countDataFiles(["a.csv", "b.geojson", "c.ts"]), 2);
});

test("only anonymous HTTP success proves accessibility", () => {
  assert.equal(isPublicReadable(200), true);
  assert.equal(isPublicReadable(206), true);
  for (const status of [301, 401, 403, 404, 500, 0]) assert.equal(isPublicReadable(status), false);
});

test("corpus validation refuses a record with a personal field", () => {
  const value = corpus([record()]) as unknown as Record<string, unknown>;
  const first = value.records as Record<string, unknown>[];
  first[0]!["email"] = "victim@example.org";
  assert.throws(() => validateCorpus(value), /personal or sensitive|Unrecognized key/i);
});

test("corpus validation refuses a tampered container id and unknown host", () => {
  const tampered = corpus([{ ...record(), id: "0000000000000000" }]);
  assert.throws(() => validateCorpus(tampered), /does not match/);
  const foreign = corpus([record({ host: "evil.example.org" })]);
  assert.throws(() => validateCorpus(foreign));
});

test("the count deduplicates and excludes unreadable or data-free containers", () => {
  const good = record();
  const duplicate = record();
  const privateRepo = record({ name: "gironde-private", status: 403 });
  const noData = record({ name: "limoges-code", dataFiles: 0 });
  const bucket = record({ kind: "bucket", host: "s3.amazonaws.com", name: "na-datasets" });
  const summary = countAccessible(validateCorpus(corpus([good, duplicate, privateRepo, noData, bucket])));
  assert.equal(summary.count, 2);
  assert.deepEqual(summary.byKind, { repository: 1, gist: 0, bucket: 1 });
  assert.equal(summary.accessibleChecked, 3);
  assert.equal(summary.duplicates, 1);
});

test("an empty corpus is a valid zero measurement", () => {
  assert.deepEqual(countAccessible(validateCorpus(corpus([]))), {
    count: 0,
    byKind: { repository: 0, gist: 0, bucket: 0 },
    accessibleChecked: 0,
    duplicates: 0,
  });
});
