/**
 * Fuites documentées : chaque comportement nouveau a son test.
 *
 * - rapprochement strict par domaine (jamais sur le nom, jamais sur un suffixe public) ;
 * - extraction LeakIX sans IP ni donnée personnelle ;
 * - lecture d'un flux RSS sans contenu d'article ;
 * - écriture en base des seules métadonnées, avec le compte exact d'organisations ;
 * - publication des taux d'échec par source, y compris quand tout échoue.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import type { CollectContext } from "@radar/shared";
import { query } from "../src/db.js";
import {
  collecterFuites,
  correspondreDomaine,
  domaineDansTexte,
  extraireHitsLeakix,
  extraireItemsRss,
} from "../src/collectors/fuites.collector.js";

const TAG = `f${randomBytes(4).toString("hex")}`;
const DOMAINE = `aaaa-fuites-${TAG}.fr`;
const DOMAINE_HORS_NA = `zzz-hors-na-${TAG}.fr`;
let orgId: number;
let orgHorsNaId: number;

before(async () => {
  const { rows } = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, city, dept, domain)
     VALUES ($1, $2, 'entreprise', 'Bordeaux', '33', $3) RETURNING id`,
    [`Organisation fuite ${TAG}`, `org-fuite-${TAG}`, `www.${DOMAINE}`],
  );
  orgId = Number(rows[0]?.id);
  const horsNa = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, city, dept, domain)
     VALUES ($1, $2, 'entreprise', 'Paris', '75', $3) RETURNING id`,
    [`Organisation hors NA ${TAG}`, `org-hors-na-${TAG}`, DOMAINE_HORS_NA],
  );
  orgHorsNaId = Number(horsNa.rows[0]?.id);
});

after(async () => {
  await query("DELETE FROM org WHERE id IN ($1, $2)", [orgId, orgHorsNaId]);
});

function contexte(echecs = false): CollectContext {
  return {
    fetchJson: async <T = unknown>(url: string): Promise<T> => {
      if (echecs) throw new Error(`indisponible ${url}`);
      assert.match(url, /haveibeenpwned\.com\/api\/v3\/breaches$/);
      return [
        {
          Name: `Fuite test ${TAG}`,
          Domain: DOMAINE,
          BreachDate: "2025-03-16",
          AddedDate: "2025-04-01T00:00:00Z",
          PwnCount: 1234,
          Source: "source-publique",
          IsVerified: true,
          IsFabricated: false,
          DataClasses: ["Email addresses"],
        },
        { Name: `Fuite non vérifiée ${TAG}`, Domain: DOMAINE, IsVerified: false },
        { Name: `Fuite fabriquée ${TAG}`, Domain: DOMAINE, IsVerified: true, IsFabricated: true },
        { Name: `Fuite hors NA ${TAG}`, Domain: DOMAINE_HORS_NA, IsVerified: true },
      ] as T;
    },
    fetchText: async (url: string): Promise<string> => {
      if (echecs) throw new Error(`indisponible ${url}`);
      if (url.includes("leakix.net")) {
        return `
          <h5><a href="/domain/${DOMAINE}">${DOMAINE}</a></h5>
          plugin%3A%22TestPlugin%22 events.leak.severity%3A%22medium%22 country%3A%22France%22
          l9fp%3A%22abcd1234%22 2025-05-01 10:00 2025-05-02 10:00
          Courriel de contact : victime@example.com — password: secret123
          <h5><a href="/domain/${DOMAINE}">${DOMAINE}</a></h5>
          plugin%3A%22TestPlugin%22 l9fp%3A%22abcd1234%22
          <hr>
          <h5><a href="/host/203.0.113.4">203.0.113.4</a></h5>
          plugin%3A%22TestPlugin%22 l9fp%3A%22ffffffff%22`;
      }
      if (url.includes("databreaches.net")) {
        return `<rss><channel><item>
          <title><![CDATA[Incident ${TAG} : ${DOMAINE}]]></title>
          <link>https://example.invalid/article-${TAG}</link>
          <pubDate>2025-11-18T10:00:00Z</pubDate>
          <description>&lt;p&gt;Fuite documentée chez ${DOMAINE}.&lt;/p&gt;</description>
        </item></channel></rss>`;
      }
      return "AABBCC:12\r\nDDEEFF:3\r\n";
    },
    cursor: {},
    log: () => {},
    now: () => new Date(),
  };
}

test("rapprochement : exact, sous-domaine, parent ; pas de TLD ni de suffixe public croisés", () => {
  assert.equal(correspondreDomaine("exemple.fr", "exemple.fr"), "exact");
  assert.equal(correspondreDomaine("sous.exemple.fr", "exemple.fr"), "sous-domaine");
  assert.equal(correspondreDomaine("exemple.fr", "sous.exemple.fr"), "parent");
  assert.equal(correspondreDomaine("exemple.fr", "exemple.com"), null);
  assert.equal(correspondreDomaine("autre.co.uk", "ville.co.uk"), null);
  assert.equal(correspondreDomaine("exemple.fr", null), null);
  assert.equal(domaineDansTexte("exemple.fr", "chez www.exemple.fr"), true);
  assert.equal(domaineDansTexte("exemple.fr", "exemple.france"), false);
});

test("LeakIX : seuls les noms de domaine rattachent, jamais une IP ni un courriel", () => {
  const html = `<h5><a href="/domain/${DOMAINE}">${DOMAINE}</a></h5>
    plugin%3A%22TestPlugin%22 l9fp%3A%22abcd%22 2025-05-01 10:00
    victime@example.com password: secret123
    <hr><h5><a href="/host/203.0.113.4">203.0.113.4</a></h5>`;
  const hits = extraireHitsLeakix(html, DOMAINE);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.host, DOMAINE);
  assert.equal(hits[0]?.plugin, "TestPlugin");
  assert.equal(hits[0]?.firstSeen, "2025-05-01T10:00:00Z");
  assert.equal(JSON.stringify(hits).includes("example.com"), false);
  assert.equal(JSON.stringify(hits).includes("secret123"), false);
});

test("RSS : titre, lien et date lus sans conserver le contenu de l'article", () => {
  const [item] = extraireItemsRss(
    `<rss><item><title>Un titre &amp; un fait</title><link>https://example.invalid/a</link>
     <pubDate>2025-11-18T10:00:00Z</pubDate><description>texte long</description></item></rss>`,
  );
  assert.equal(item?.title, "Un titre & un fait");
  assert.equal(item?.link, "https://example.invalid/a");
  assert.equal(item?.description, "texte long");
});

test("collecte simulée : 4 métadonnées, 1 organisation NA, zéro donnée personnelle", async () => {
  const resultat = await collecterFuites(contexte());
  assert.equal(resultat.references, 4);
  assert.ok(resultat.organisations >= 1, "au moins une organisation NA rattachee");
  assert.ok(resultat.domainesOrganisations >= 1, "au moins un domaine rattache");
  const { rows: horsNa } = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM fuite_org WHERE org_id = $1", [orgHorsNaId],
  );
  assert.equal(horsNa[0]?.n, "0");
  assert.deepEqual(resultat.stats.map((s) => [s.source, s.echecs]), [
    ["hibp", 0],
    ["databreaches", 0],
    ["leakix", 0],
    ["pwned-passwords", 0],
  ]);

  const { rows: orgs } = await query<{ n: string }>(
    "SELECT count(DISTINCT org_id)::text AS n FROM fuite_org",
  );
  assert.ok(Number(orgs[0]?.n) >= 1, "au moins une organisation en base");
  const { rows: comptes } = await query<{ source: string; n: string; echecs: number }>(
    "SELECT source, count(*)::text AS n, echecs FROM fuite_stat GROUP BY source, echecs ORDER BY source",
  );
  assert.deepEqual(comptes.map((r) => [r.source, r.n, r.echecs]), [
    ["databreaches", "1", 0],
    ["hibp", "1", 0],
    ["leakix", "1", 0],
    ["pwned-passwords", "1", 0],
  ]);
  const { rows: sensibles } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM fuite_reference
      WHERE evidence::text ~* '@|password|secret123|203\\.0\\.113\\.4'
         OR name ~* 'password|secret' OR domain ~* '^[0-9.]+$'`,
  );
  assert.equal(sensibles[0]?.n, "0");
  const { rows: detail } = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM fuite_stat WHERE source = 'hibp' AND (detail->>'ignores_non_verifies')::int = 2",
  );
  assert.equal(detail[0]?.n, "1");
});

test("sources indisponibles : chaque échec est compté, aucune référence inventée", async () => {
  const avant = await query<{ n: string }>("SELECT count(*)::text AS n FROM fuite_reference");
  const resultat = await collecterFuites(contexte(true));
  const apres = await query<{ n: string }>("SELECT count(*)::text AS n FROM fuite_reference");
  assert.equal(apres.rows[0]?.n, avant.rows[0]?.n);
  assert.deepEqual(resultat.stats.map((s) => s.echecs > 0), [true, true, true, true]);
  assert.equal(resultat.organisations, 0);
});
