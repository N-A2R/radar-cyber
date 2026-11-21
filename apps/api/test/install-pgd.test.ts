/**
 * Régression PGDG : sur une machine qui a déjà une source apt.postgresql.org
 * (avec un autre `Signed-By`) et/ou le paquet postgresql-18, l'installateur ne
 * doit ni ajouter de source concurrente, ni casser APT. Les commandes apt/dpkg
 * sont simulées dans un bac à sable : aucun paquet du poste de test n'est touché.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const EXISTING_SOURCE =
  "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] " +
  "https://apt.postgresql.org/pub/repos/apt trixie-pgdg main\n";

const APT_GET = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_APT_LOG"
count=$(grep -c '^update' "$FAKE_APT_LOG" || true)
if [ "$1" = update ] && [ "$count" -gt 1 ] && [ "\${FAKE_FAIL_REPO_UPDATE:-0}" = 1 ]; then
  exit 100
fi
exit 0
`;

const DPKG = `#!/usr/bin/env bash
if [ "$1" = -s ] && [ "\${FAKE_PG_INSTALLED:-0}" = 1 ]; then
  printf 'Package: %s\\nStatus: install ok installed\\n' "$2"
  exit 0
fi
exit 1
`;

type Setup = { existingSource?: boolean; pgInstalled?: boolean; failRepoUpdate?: boolean };

async function prepare(options: Setup = {}) {
  const dir = await mkdtemp(join(tmpdir(), "radar-pgd-"));
  const bin = join(dir, "bin");
  const sources = join(dir, "sources.list.d");
  await mkdir(bin);
  await mkdir(sources);
  await writeFile(join(dir, "sources.list"), "");
  await writeFile(join(dir, "os-release"), 'ID=debian\nVERSION_CODENAME=trixie\nPRETTY_NAME="Debian GNU/Linux 13"\n');
  await writeFile(join(dir, "keyring.gpg"), "clef de test\n");
  if (options.existingSource) await writeFile(join(sources, "postgresql.list"), EXISTING_SOURCE);
  await writeFile(join(bin, "apt-get"), APT_GET, { mode: 0o755 });
  await writeFile(join(bin, "dpkg"), DPKG, { mode: 0o755 });
  return { dir, sources };
}

function runInstall(dir: string, sources: string, env: Record<string, string>) {
  return spawnSync("bash", ["scripts/install.sh", "--prepare-packages"], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${join(dir, "bin")}:${process.env.PATH ?? ""}`,
      RADAR_OS_RELEASE: join(dir, "os-release"),
      RADAR_APT_SOURCE_DIR: sources,
      RADAR_PGDG_KEY: join(dir, "keyring.gpg"),
      FAKE_APT_LOG: join(dir, "apt.log"),
      ...env,
    },
  });
}

test("PGDG déjà configuré et PG 18 installé : aucune source ajoutée, apt-get update reste vert", async () => {
  const { dir, sources } = await prepare({ existingSource: true, pgInstalled: true });
  try {
    const res = runInstall(dir, sources, { FAKE_PG_INSTALLED: "1", FAKE_FAIL_REPO_UPDATE: "1" });
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
    assert.equal(existsSync(join(sources, "radar-postgresql.list")), false, "APT n'est pas laissé cassé");
    const aptLog = await readFile(join(dir, "apt.log"), "utf8");
    assert.equal(aptLog.match(/^update/gm)?.length, 1, "un seul apt-get update");
    assert.doesNotMatch(aptLog, /install .*postgresql-18/, "aucune réinstallation de PG 18");
    assert.equal(await readFile(join(sources, "postgresql.list"), "utf8"), EXISTING_SOURCE);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("échec d'apt-get update après ajout PGDG : la source créée est retirée", async () => {
  const { dir, sources } = await prepare({ failRepoUpdate: true });
  try {
    const res = runInstall(dir, sources, { FAKE_PG_INSTALLED: "0", FAKE_FAIL_REPO_UPDATE: "1" });
    assert.notEqual(res.status, 0);
    assert.match(res.stdout, /apt-get update a échoué après l'ajout du dépôt PGDG/);
    assert.match(res.stdout, /Source PGDG créée par ce script retirée/);
    assert.equal(existsSync(join(sources, "radar-postgresql.list")), false, "APT n'est pas laissé cassé");
    const aptLog = await readFile(join(dir, "apt.log"), "utf8");
    assert.doesNotMatch(aptLog, /install .*postgresql-18/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("machine neuve : la source PGDG est ajoutée puis PG 18 installé", async () => {
  const { dir, sources } = await prepare();
  try {
    const res = runInstall(dir, sources, { FAKE_PG_INSTALLED: "0", FAKE_FAIL_REPO_UPDATE: "0" });
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
    assert.match(res.stdout, /Dépôt PGDG ajouté/);
    assert.match(await readFile(join(sources, "radar-postgresql.list"), "utf8"), /signed-by=.*keyring\.gpg/);
    const aptLog = await readFile(join(dir, "apt.log"), "utf8");
    assert.match(aptLog, /install -y -qq postgresql-18 postgresql-client-18/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
