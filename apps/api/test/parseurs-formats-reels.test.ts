import { test } from "node:test";
import assert from "node:assert/strict";
import { detectItems, parseNarrativeItems } from "../src/collectors/generic.js";
import { detectSourceFormat, normalizeLanguage, parseSource } from "../src/collectors/parsers/formats.js";

/**
 * Échantillons RÉELS prélevés le 21 novembre 2026 sur les sources de la base
 * de travail (5433), puis tronqués au premier ou aux deux premiers items :
 *   RSS 2.0   https://www.cert.ssi.gouv.fr/alerte/feed/       (source cert-fr-alerte)
 *   Atom      https://www.schneier.com/feed/atom/              (source cat-schneier-security)
 *   JSON-LD   https://www.lamontagne.fr/correze                (source presse-lamontagne-correze)
 *   HTML      https://www.lamontagne.fr/correze                (bloc <article>)
 *   HTML      https://www.ransomlook.io/                       (bloc <main>)
 *   JSON      https://ransomlook.io/api/recent                 (source leak:ransomlook:recent-api)
 * Aucun champ n'est fabriqué pour les tests : ce sont les octets reçus.
 */

const RSS2 =
  "<?xml version='1.0' encoding='UTF-8'?>\n<rss xmlns:atom=\"http://www.w3.org/2005/Atom\" xmlns:content=\"http://purl.org/rss/1.0/modules/content/\" version=\"2.0\"><channel><title>CERT-FR</title><link>https://www.cert.cyber.gouv.fr/feed/</link><description>Centre gouvernemental de veille, d'alerte et de réponse aux attaques informatiques.</description><atom:link href=\"https://www.cert.cyber.gouv.fr/feed/\" rel=\"self\"/><docs>http://www.rssboard.org/rss-specification</docs><generator>CERT-FR</generator><language>fr-FR</language><lastBuildDate>Fri, 20 Nov 2026 14:05:18 +0000</lastBuildDate><item><title>Vulnérabilité dans Apple Mac OS X (24 juillet 2015)</title><link>https://www.cert.cyber.gouv.fr/alerte/CERTFR-2015-ALE-009/</link><description>Une vulnérabilité a été découverte dans Apple Mac OS X. Elle permet à un attaquant de provoquer une élévation de privilèges.</description><guid isPermaLink=\"true\">https://www.cert.cyber.gouv.fr/alerte/CERTFR-2015-ALE-009/</guid><pubDate>Fri, 24 Jul 2015 00:00:00 +0000</pubDate></item><item><title>[MàJ] Vulnérabilité dans Palo Alto Networks GlobalProtect (12 avril 2024)</title><link>https://www.cert.cyber.gouv.fr/alerte/CERTFR-2024-ALE-006/</link><description>\\[Mise à jour du 10 mai 2024\\] Le CERT-FR est intervenu pour le traitement d'une compromission par rançongiciel au sein d'une entité française. Dans le cadre de cette attaque, la vulnérabilité a été exploitée pour ensuite réaliser une latéralisation dans le système d'information de la victime et...</description><guid isPermaLink=\"true\">https://www.cert.cyber.gouv.fr/alerte/CERTFR-2024-ALE-006/</guid><pubDate>Fri, 12 Apr 2024 00:00:00 +0000</pubDate></item><item><title>Vulnérabilité dans Open";

const ATOM =
  "<?xml version=\"1.0\" encoding=\"UTF-8\"?><feed\n\txmlns=\"http://www.w3.org/2005/Atom\"\n\txmlns:thr=\"http://purl.org/syndication/thread/1.0\"\n\txml:lang=\"en-US\"\n\t>\n\t<title type=\"text\">Schneier on Security</title>\n\t<subtitle type=\"text\"></subtitle>\n\n\t<updated>2026-11-20T22:04:30Z</updated>\n\n\t<link rel=\"alternate\" type=\"text/html\" href=\"https://www.schneier.com/\" />\n\t<id>https://www.schneier.com/feed/atom/</id>\n\t<link rel=\"self\" type=\"application/atom+xml\" href=\"https://www.schneier.com/feed/atom/\" />\n\n\t\n<icon>https://www.schneier.com/wp-content/uploads/2020/06/cropped-favicon-1-32x32.png</icon>\n\t<entry>\n\t\t<author>\n\t\t\t<name>Bruce Schneier</name>\n\t\t\t\t\t</author>\n\n\t\t<title type=\"html\"><![CDATA[Friday Squid Blogging: The Largest Squid Ever Filmed]]></title>\n\t\t<link rel=\"alternate\" type=\"text/html\" href=\"https://www.schneier.com/blog/archives/2026/11/friday-squid-blogging-the-largest-squid-ever-filmed.html\" />\n\n\t\t<id>https://www.schneier.com/?p=72970</id>\n\t\t<updated>2026-11-20T22:04:30Z</updated>\n\t\t<published>2026-11-20T22:04:12Z</published>\n\t\t<category scheme=\"https://www.schneier.com/\" term=\"Uncategorized\" /><category scheme=\"https://www.schneier.com/\" term=\"squid\" />\n\t\t<summary type=\"html\"><![CDATA[<p>This <a href=\"https://www.worldatlas.com/oceans/the-largest-squid-ever-filmed.html\"> is the story</a> of the largest squid ever filmed, in December 2006 near Japan&#8217;s Ogasawara Islands.</p>\n<p>As usual, you can also use this squid post to talk about the security stories in the news that I haven&#8217;t covered.</p>\n<p><a href=\"https://www.schneier.com/blog/archives/2024/06/new-blog-moderation-policy.html\">Blog moderation policy.</a></p>\n]]></summary>\n\n\t\t\t\t\t<content type=\"html\" xml:base=\"https://www.schneier.com/blog/archives/2026/11/friday-squid-blogging-the-largest-squid-ever-filmed.html\"><![CDATA[<p>This <a href=\"https://www.worldatlas.com/oceans/the-largest-squid-ever-filmed.html\"> is the story</a> of the largest squid ever filmed, in December 2006 near Japan&#8217;s Ogasawara Islands.</p>\n<p>As usual, you can also use this squid post to talk about the security stories in the news that I haven&#8217;t covered.</p>\n<p><a href=\"https://www.schneier.com/blog/archives/2024/06/new-blog-moderation-policy.html\">Blog moderation policy.</a></p>\n]]></content>\n\t\t\n\t\t\t\t\t<link rel=\"";
/** Le flux réel est coupé après `</summary>` ; on referme seulement les balises ouvertes. */
const ATOM_FIXED = `${ATOM.slice(0, ATOM.indexOf("<content type=\"html\"")).trimEnd()}</entry></feed>`;

const LD_PREFIX =
  "{\"@context\":\"https://schema.org\",\"@type\":\"CollectionPage\",\"name\":\"Actualités - Corrèze\",\"url\":\"/correze\",\"mainEntity\":{\"@type\":\"ItemList\",\"itemListElement\":[{\"@type\":\"Article\",\"headline\":\"Rugby (Espoirs) : un travail à mi-temps mal payé pour les Brivistes battus à Toulouse\",\"url\":\"/brive-la-gaillarde-19100/sports/rugby-espoirs-un-travail-a-mi-temps-mal-paye-pour-les-brivistes-battus-a-toulouse_15088509/\",\"datePublished\":\"2026-11-21T18:12:00Z\",\"author\":{\"@type\":\"Person\",\"name\":\"\"},\"image\":\"https://img.centrefrance.com/hmb2DzGxMN5I7GTmE1fadnnJlnfISdJhaTvsLNWMTVg/rs:fill:375:250:1:0/g:sm/bG9jYWw6Ly8vMDAvMDAvMDcvODYvNzAvMjAwMDAwNzg2NzA4Nw.webp\"},{\"@type\":\"Article\",\"headline\":\"Jeunesse au rendez-vous, erreurs payées cash et classement resserré : retour en trois points sur la défaite de Brive à Oyonnax\",\"url\":\"/brive-la-gaillarde-19100/sports/jeunesse-au-rendez-vous-erreurs-payees-cash-et-classement-resserre-retour-en-trois-points-sur-la-defaite-de-brive-a-oyonnax_15088442/\",\"datePublished\":\"2026-11-21T16:30:00Z\",\"author\":{\"@type\":\"Person\",\"name\":\"\"},\"image\":\"https://img.centrefrance.com/atUPnxLaHTEr9dTb9CyCR5KDivlwDio0GoxPrK5eJC4/rs:fill:375:250:1:0/g:sm/bG9jYWw6Ly8vMDAvMDAvMDcvODYvNjkvMjAwMDAwNzg2Njk2NA.webp\"},{\"@type\":\"Article\",\"headline\":\"National 2, Régional 1 et Régional 2 : suiv";
const LD_PAGE = `<!doctype html><html lang="fr"><script type="application/ld+json">${LD_PREFIX}</script></html>`;

const ARTICLE_PREFIX =
  "<article class=\"relative flex h-full flex-col gap-4 sm:col-span-2 sm:row-span-2\"><a class=\"group flex h-full flex-col gap-3\" target=\"_self\" href=\"/brive-la-gaillarde-19100/sports/rugby-espoirs-un-travail-a-mi-temps-mal-paye-pour-les-brivistes-battus-a-toulouse_15088509/\"><div class=\"flex flex-col gap-2\"><h2 class=\"typo-card-heading-1 group-hover:text-neutral-9 items-center justify-center\"><span class=\"mr-1.5 sm:mr-2\"><span class=\"cf-icon premium-icon size-4 align-[0em] sm:size-6\" role=\"img\" aria-labelledby=\"icone premium\"></span></span>Rugby (Espoirs) : un travail à mi-temps mal payé pour les Brivistes battus à Toulouse</h2></div><section class=\"flex flex-1 items-center justify-center\"><div class=\"relative w-full\"><img alt=\"\" loading=\"lazy\" width=\"657\" height=\"438\" decoding=\"async\" data-nimg=\"1\" class=\"bg-black-1 max-h-[438px] w-full rounded-lg object-contain\" style=\"color:transparent\" src=\"https://img.centrefrance.com/NNrum0MUnKHK6vK3HoiF3FkE-wr9t_iUrdHp9qbWa70/rs:fit:657:438:1:0/bG9jYWw6Ly8vMDAvMDAvMDcvODYvNzAvMjAwMDAwNzg2NzA4Nw.webp\"/></div></section></a><div class=\"grid grid-cols-1 gap-3 px-6 sm:grid-cols-[repeat(2,auto)] sm:gap-x-6 sm:gap-y-3\"><div class=\"flex gap-3\"><div class=\"flex items-start pt-1\"><div class=\"bg-primary-9 size-2 flex-none rounded-xs\"></div></div><a class=\"gap-3\" href=\"/brive-la-gaillarde-19100/sports/le-sud-africain-qui-ne-parlait-pas-un-mot-de-francais-nathan-claassen-20-ans-s-est-battu-pour-jouer-avec-les-espoirs-de-brive_15087538/\"><h3 class=\"typo-card-heading-3 group-hover:text-neutral-9 h-fit grow text-sm \"><span class=\"mr-1 text-xs\"><span cla";
const ARTICLE_PAGE = `<!doctype html><html lang="fr">${ARTICLE_PREFIX}`;
/** Même page : le JSON-LD porte la date, le bloc article porte le résumé. */
const LD_ARTICLE_PAGE = `${LD_PAGE}${ARTICLE_PREFIX}`;

const MAIN_PAGE =
  "<html lang=\"en\"><main id=\"content\">\n\n<section class=\"home-hero\">\n  <div class=\"home-hero__bg\" aria-hidden=\"true\"></div>\n  <div class=\"container home-hero__inner\">\n    <div class=\"home-hero__split\">\n      \n        <div class=\"home-hero__logo\">\n          <img src=\"/static/ransomlook.svg\" alt=\"RansomLook logo\" loading=\"eager\" decoding=\"async\">\n        </div>\n      \n\n      <div class=\"home-hero__text\">\n        <h1 class=\"home-hero__title\">\n          <span class=\"hl-number\">37,349</span>\n          <span class=\"hl-sub\">ransomware posts.</span><br>\n          <span class=\"hl-muted\">Tracked in the open.</span>\n        </h1>\n        <p class=\"home-hero__lead\">\n          Open-source intelligence on 651 ransomware groups, markets and threat actors. Updated live since 2022.\n        </p>\n        <div class=\"home-hero__ctas\">\n          <a class=\"btn-hero btn-hero--primary\" href=\"/recent\">Explore &rarr;</a>\n          <a class=\"btn-hero btn-hero--ghost\"   href=\"/stats\">Stats</a>\n          <a class=\"btn-hero btn-hero--ghost\"   href=\"/doc/\">API</a>\n        </div>\n      </div>\n    </div>\n\n    <div class=\"spark-band\">\n      <div class=\"activity-head\">\n        <span class=\"live-dot\" aria-hidden=\"true\"></span>\n        <span class=\"activity-label\">Activity · last 30 days</span>\n        \n          <span class=\"activity-delta\">vs prev 7d <span class=\"delta-badge delta-up-strong\">▲ +8.2%</span></span>\n        \n      </div>\n      \n      <svg class=\"hero-spark\" viewBox=\"0 0 300 48\" preserveAspectRatio=\"none\">\n        <defs><linearGradient id=\"hero-spark-grad\" x1=\"0\" x2=\"0\" y1=\"0\" y2=\"1\"><stop offset=\"0%\" stop-color=\"currentColor\" stop-opacity=\".55\"/><stop offset=\"100%\" stop-color=\"currentColor\" stop-opacity=\"0\"/></l";

const JSON_MAISON =
  '[{"post_title": "tiic.com.ph", "discovered": "2026-11-21 19:16:36.237954", ' +
  '"description": "Established in the 1950s, the company has developed into an established manufacturer and supplier of industrial chemicals, paints, construction materials, \\u2026", ' +
  '"link": "/blog/post/tiiccomph/", "magnet": null, "screen": null, "private": false, ' +
  '"misp_uuid": "15333d6d-6e7f-570c-910f-c11d3f827393", "group_name": "safepay"}]';

function champs(item: Record<string, unknown>): string[] {
	return Object.keys(item).sort();
}

test("RSS 2.0 réel : titre, date, lien, résumé et langue du flux", () => {
	const result = parseSource(RSS2, { contentType: "application/rss+xml" });
	assert.equal(result.format, "rss2");
	assert.equal(result.language, "fr");
	assert.equal(result.items.length, 2, "le flux tronqué contient deux items complets");
	assert.deepEqual(champs(result.items[0] as unknown as Record<string, unknown>), ["date", "language", "link", "summary", "title"]);
	assert.match(result.items[0].title, /Vulnérabilité dans Apple Mac OS X/);
	assert.equal(result.items[0].date, "Fri, 24 Jul 2015 00:00:00 +0000");
	assert.equal(result.items[0].link, "https://www.cert.cyber.gouv.fr/alerte/CERTFR-2015-ALE-009/");
	assert.match(result.items[0].summary, /élévation de privilèges/);
	assert.equal(result.items[0].language, "fr");
	assert.match(result.items[1].title, /GlobalProtect/);
	assert.equal(detectSourceFormat(RSS2), "rss2");
});

test("Atom réel : lien alternate, published, CDATA et xml:lang", () => {
	const result = parseSource(ATOM_FIXED, { contentType: "application/atom+xml" });
	assert.equal(result.format, "atom");
	assert.equal(result.language, "en");
	assert.equal(result.items.length, 1);
	assert.equal(result.items[0].title, "Friday Squid Blogging: The Largest Squid Ever Filmed");
	assert.equal(result.items[0].link, "https://www.schneier.com/blog/archives/2026/11/friday-squid-blogging-the-largest-squid-ever-filmed.html");
	assert.equal(result.items[0].date, "2026-11-20T22:04:12Z");
	assert.match(result.items[0].summary, /largest squid ever filmed/);
	assert.equal(result.items[0].language, "en");
	assert.equal(detectItems(ATOM_FIXED, "application/atom+xml").strategy, "atom");
});

test("JSON-LD réel tronqué : objets complets d'un @graph imbriqué", () => {
	const result = parseSource(LD_PAGE, { sourceUrl: "https://www.lamontagne.fr/correze" });
	assert.equal(result.format, "jsonld");
	assert.equal(result.language, "fr");
	assert.equal(result.items.length, 2, "deux articles complets avant la coupure");
	assert.match(result.items[0].title, /Rugby \(Espoirs\)/);
	assert.equal(result.items[0].date, "2026-11-21T18:12:00Z");
	assert.equal(result.items[0].link, "https://www.lamontagne.fr/brive-la-gaillarde-19100/sports/rugby-espoirs-un-travail-a-mi-temps-mal-paye-pour-les-brivistes-battus-a-toulouse_15088509/");
	assert.equal(result.items[0].language, "fr");
	assert.match(result.items[1].title, /Jeunesse au rendez-vous/);
	assert.equal(detectItems(LD_PAGE, "text/html").strategy, "json-ld");
});

test("HTML réel : un bloc <article> donne un item, pas le menu", () => {
	const result = parseSource(ARTICLE_PAGE, { sourceUrl: "https://www.lamontagne.fr/correze" });
	assert.equal(result.format, "html");
	assert.equal(result.path, "article");
	assert.equal(result.items.length, 1);
	assert.match(result.items[0].title, /Rugby \(Espoirs\)/);
	assert.equal(result.items[0].link, "https://www.lamontagne.fr/brive-la-gaillarde-19100/sports/rugby-espoirs-un-travail-a-mi-temps-mal-paye-pour-les-brivistes-battus-a-toulouse_15088509/");
	assert.ok(result.items[0].summary.length > 40);
	assert.equal(result.items[0].language, "fr");
});

test("HTML réel : un bloc <main> donne un item avec ses métadonnées", () => {
	const result = parseSource(MAIN_PAGE, { sourceUrl: "https://www.ransomlook.io/" });
	assert.equal(result.format, "html");
	assert.equal(result.path, "main");
	assert.equal(result.items.length, 1);
	assert.match(result.items[0].title, /ransomware posts/);
	assert.match(result.items[0].summary, /Open-source intelligence on 651 ransomware groups/);
	assert.equal(result.items[0].link, "https://www.ransomlook.io/recent");
	assert.equal(result.items[0].language, "en");
});

test("flux JSON maison réel : champs post_title/discovered/link normalisés", () => {
	const result = parseSource(JSON_MAISON, { contentType: "application/json", sourceUrl: "https://ransomlook.io/api/recent" });
	assert.equal(result.format, "json");
	assert.equal(result.items.length, 1);
	assert.equal(result.items[0].title, "tiic.com.ph");
	assert.equal(result.items[0].date, "2026-11-21 19:16:36.237954");
	assert.equal(result.items[0].link, "https://ransomlook.io/blog/post/tiiccomph/");
	assert.match(result.items[0].summary, /industrial chemicals/);
	assert.equal(result.items[0].language, "en");
	assert.equal(detectItems(JSON_MAISON, "application/json").strategy, "json-nested-array");
});

test("intégration collecte : les cinq champs survivent à parseNarrativeItems", () => {
	for (const [body, format, parser] of [
		[RSS2, "rss", {}],
		[ATOM_FIXED, "atom", {}],
		[LD_ARTICLE_PAGE, "html", {}],
		[ARTICLE_PAGE, "html", {}],
		[MAIN_PAGE, "html", {}],
		[JSON_MAISON, "json", { dateField: "discovered", titleField: "post_title", linkField: "link" }],
	] as const) {
		const items = parseNarrativeItems(body, parser as Record<string, unknown>, format);
		assert.ok(items.length > 0, `${format} : aucun item`);
		for (const key of ["title", "date", "link", "summary", "language"]) {
			assert.ok(typeof items[0][key] === "string", `${format} : champ ${key} absent`);
		}
		for (const key of ["title", "link", "summary", "language"]) {
			assert.ok(String(items[0][key]).length > 0, `${format} : ${key} vide`);
		}
		// Une page sans date publiée ne doit pas en inventer une.
		if (/datePublished|pubDate|<published>|discovered/.test(body)) {
			assert.ok(String(items[0].date).length > 0, `${format} : date publiée perdue`);
		}
	}
});

test("corps invalide ou sans contenu : zéro item inventé", () => {
	assert.equal(parseSource("", null).format, "unknown");
	assert.equal(parseSource("{ pas du json", "application/json").items.length, 0);
	assert.equal(parseSource('["simple", "chaines"]', "application/json").items.length, 0);
	assert.equal(parseSource("<html><body><nav>Menu</nav></body></html>", "text/html").items.length, 0);
	assert.equal(detectItems("", "text/plain").strategy, "none");
	assert.equal(normalizeLanguage("fr-FR"), "fr");
	assert.equal(normalizeLanguage("en_US"), "en");
	assert.equal(normalizeLanguage(undefined), "");
});
