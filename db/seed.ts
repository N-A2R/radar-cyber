import pg from 'pg';
import { readFileSync } from 'node:fs';

const CSV_PATH = process.env.ORGS_CSV ?? '/home/jolt/tmp/orgs-na.csv';

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function slugify(name: string): string {
  return stripAccents(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => { obj[h] = (cols[idx] ?? '').trim(); });
    rows.push(obj);
  }
  return rows;
}

const STATIC_GEO: Record<string, { lat: number; lon: number }> = {};
const staticEntries: Array<[string, number, number]> = [
  ['Bordeaux', 44.8378, -0.5792],
  ['Merignac', 44.8422, -0.6453],
  ['Pessac', 44.8067, -0.6311],
  ['Talence', 44.8084, -0.5841],
  ['Libourne', 44.9131, -0.2442],
  ['Arcachon', 44.6586, -1.1688],
  ['Poitiers', 46.5802, 0.3404],
  ['Niort', 46.3238, -0.4588],
  ['La Rochelle', 46.1591, -1.1520],
  ['Rochefort', 45.9421, -0.9667],
  ['Saintes', 45.7466, -0.6333],
  ['Angouleme', 45.6484, 0.1562],
  ['Cognac', 45.6959, -0.3294],
  ['Limoges', 45.8336, 1.2611],
  ['Gueret', 46.1706, 1.8703],
  ['Perigueux', 45.1841, 0.7213],
  ['Agen', 44.2022, 0.6211],
  ['Mont-de-Marsan', 43.8907, -0.4997],
  ['Dax', 43.7102, -1.0536],
  ['Pau', 43.2951, -0.3708],
  ['Bayonne', 43.4929, -1.4748],
  ['Biarritz', 43.4832, -1.5586],
];
for (const [city, lat, lon] of staticEntries) {
  STATIC_GEO[stripAccents(city).toLowerCase()] = { lat, lon };
}

function normalizeCityKey(city: string, dept: string): string {
  return stripAccents(city).toLowerCase().trim();
}

async function geocodeCity(city: string, dept: string): Promise<{ lat: number; lon: number } | null> {
  const key = normalizeCityKey(city, dept);
  const staticHit = STATIC_GEO[key];
  if (staticHit) return staticHit;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city + ',' + dept + ',France')}&format=json&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'radar-cyber-na/0.1 (projet etudiant)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) return { lat, lon };
    }
  } catch (e) {
    // fallback below
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

const KIND_MAP: Record<string, string> = {
  entreprise: 'entreprise',
  collectivite: 'collectivite',
  collectivité: 'collectivite',
  sante: 'sante',
  recherche: 'recherche',
  operateur_critique: 'operateur_critique',
  'opérateur_critique': 'operateur_critique',
  ess: 'ess',
};

async function main() {
  const csv = readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(csv);

  const uniqueCities = new Map<string, { city: string; dept: string }>();
  for (const r of rows) {
    const key = `${stripAccents(r.ville).toLowerCase()}|${r.departement}`;
    if (!uniqueCities.has(key)) uniqueCities.set(key, { city: r.ville, dept: r.departement });
  }

  const geoCache = new Map<string, { lat: number; lon: number } | null>();
  let first = true;
  for (const [key, { city, dept }] of uniqueCities) {
    if (!first) await sleep(1000);
    first = false;
    const result = await geocodeCity(city, dept);
    geoCache.set(key, result);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/radar' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let orgCount = 0;
    let noCoord = 0;
    for (const r of rows) {
      const slug = slugify(r.nom);
      const kind = KIND_MAP[stripAccents(r.type).toLowerCase()] ?? KIND_MAP[r.type.toLowerCase()] ?? r.type;
      const key = `${stripAccents(r.ville).toLowerCase()}|${r.departement}`;
      const geo = geoCache.get(key) ?? null;
      const lat = geo ? geo.lat : null;
      const lon = geo ? geo.lon : null;
      if (lat === null) noCoord++;

      const orgRes = await client.query(
        `INSERT INTO org (name, slug, kind, sector, city, dept, website, domain, status, lat, lon)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (slug) DO UPDATE SET
           name=EXCLUDED.name, kind=EXCLUDED.kind, sector=EXCLUDED.sector, city=EXCLUDED.city,
           dept=EXCLUDED.dept, website=EXCLUDED.website, domain=EXCLUDED.domain,
           status=EXCLUDED.status, lat=EXCLUDED.lat, lon=EXCLUDED.lon
         RETURNING id`,
        [r.nom, slug, kind, r.secteur || null, r.ville || null, r.departement || null, r.site_web || null, r.domaine || null, r.statut === 'confirmé' ? 'confirme' : (r.statut || 'a_confirmer'), lat, lon]
      );
      const orgId = orgRes.rows[0].id;
      orgCount++;

      if (r.domaine) {
        const assetStatus = r.statut === 'confirmé' ? 'confirme' : 'candidat';
        await client.query(
          `INSERT INTO asset (org_id, kind, value, status)
           VALUES ($1,'domain',$2,$3)
           ON CONFLICT (org_id, kind, value) DO UPDATE SET status=EXCLUDED.status`,
          [orgId, r.domaine, assetStatus]
        );
      }
    }
    await client.query('COMMIT');
    console.log(`orgs: ${orgCount}, sans coordonnees: ${noCoord}`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
