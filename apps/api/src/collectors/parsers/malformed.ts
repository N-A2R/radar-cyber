/**
 * Lecture tolérante des pages `.onion` mal formées.
 *
 * Les pages de fuite sont souvent servies par de vieux serveurs : fragment
 * sans `<html>`, balises non fermées, méta-données annonçant UTF-8 alors que
 * le corps est en windows-1252 (ou l'inverse). Le parseur strict renvoie
 * `strategy: none` et la page part en quarantaine. Ce module répare le corps
 * puis n'extrait que des faits présents dans la page : titrage, liens,
 * paragraphes. Aucun événement n'est fabriqué (doctrine : rien de faux).
 */

export interface OnionRepair {
  html: string;
  repairs: string[];
  mojibake_corrige: boolean;
}

const CHALLENGE_RE =
  /just a moment|checking your browser|ddos protection|enable javascript|captcha|access denied|attention required/i;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#160": " ",
  "#39": "'",
  "#8217": "’",
};

const VOID_TAGS: Record<string, true> = {
  br: true, hr: true, img: true, input: true, meta: true, link: true, source: true,
  area: true, base: true, col: true, embed: true, param: true, track: true, wbr: true,
};

function decodeEntities(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    const key = code.toLowerCase();
    if (ENTITIES[key] !== undefined) return ENTITIES[key]!;
    if (key.startsWith("#x")) {
      const cp = parseInt(key.slice(2), 16);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
    }
    if (key.startsWith("#")) {
      const cp = parseInt(key.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
    }
    return m;
  });
}

/** Corrige le mojibake classique UTF-8 lu comme windows-1252. */
export function fixMojibake(text: string): { text: string; changed: boolean } {
  if (!/[ÃÂâ][\u0080-\u00BF\u2018-\u201D\u20AC]/.test(text)) return { text, changed: false };
  try {
    const fixed = Buffer.from(text, "latin1").toString("utf8");
    if (!fixed.includes("\uFFFD") && fixed.length <= text.length) return { text: fixed, changed: true };
  } catch {
    // on garde le texte d'origine
  }
  return { text, changed: false };
}

/**
 * Répare un corps HTML déjà décodé. Les réparations sont journalisées dans
 * `repairs` : rien n'est inventé, seule la structure manquante est ajoutée.
 */
export function repairOnionHtml(text: string): OnionRepair {
  const moji = fixMojibake(text);
  const repairs: string[] = [];
  if (moji.changed) repairs.push("mojibake-corrige");

  let html = moji.text.replace(/\u0000/g, "").replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
  if (html.length !== moji.text.length) repairs.push("caractres-de-controle-retires");

  const hasRoot = /<html\b/i.test(html);
  const hasBody = /<body\b/i.test(html);
  if (!hasRoot) {
    html = `<html><body>${html}</body></html>`;
    repairs.push("racine-html-ajoutee");
  } else if (!hasBody) {
    html = html.replace(/<\/html\s*>/i, "</body></html>");
    repairs.push("corps-html-ajoute");
  }

  // Fermeture naïve des seules balises de bloc ouvertes : suffisant pour
  // retrouver les frontières de paragraphes d'un fragment tronqué.
  const stack: string[] = [];
  const tags = html.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi);
  for (const m of tags) {
    const raw = m[0]!;
    const tag = m[1]!.toLowerCase();
    if (VOID_TAGS[tag]) continue;
    if (raw.startsWith("</")) {
      const i = stack.lastIndexOf(tag);
      if (i >= 0) stack.splice(i, 1);
    } else if (!raw.endsWith("/>")) {
      stack.push(tag);
    }
  }
  if (stack.length > 0) {
    const closing = [...new Set(stack)].reverse().map((t) => `</${t}>`).join("");
    html += closing;
    repairs.push(`${stack.length}-balises-fermees`);
  }

  return { html, repairs, mojibake_corrige: moji.changed };
}

function plain(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/**
 * Extrait des items d'une page illisible. Retourne `null` pour un challenge
 * anti-bot ou une page sans contenu vérifiable : on ne fabrique rien.
 */
export function parseMalformedOnion(text: string): Record<string, unknown>[] | null {
  if (typeof text !== "string" || text.trim().length < 40) return null;
  const { html } = repairOnionHtml(text);
  if (CHALLENGE_RE.test(html.slice(0, 5000))) return null;

  const source = html.replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const title = plain(source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
    || plain(source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");

  const items: Record<string, unknown>[] = [];
  const blocks = source.matchAll(
    /<(?:p|li|h[1-4]|div|td|article)\b[^>]*>([\s\S]{20,2500}?)<\/(?:p|li|h[1-4]|div|td|article)\s*>/gi,
  );
  for (const m of blocks) {
    const inner = m[1] ?? "";
    const summary = plain(inner);
    if (summary.length < 40) continue;
    const href = inner.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1]
      ?? source.match(/<a\b[^>]*href=["']([^"']+\.onion[^"']*)["']/i)?.[1];
    items.push({
      title: title || summary.slice(0, 100),
      summary: summary.slice(0, 800),
      ...(href ? { link: decodeEntities(href) } : {}),
    });
    if (items.length >= 50) break;
  }

  if (items.length === 0) {
    // Page courte sans bloc : on n'accepte que si un titre substantiel et
    // une adresse sont réellement présents (changement d'adresse du site).
    const whole = plain(source);
    if (whole.length >= 60 && whole.length <= 2000 && /\.onion\b|https?:\/\//i.test(whole)) {
      items.push({ title: title || whole.slice(0, 100), summary: whole.slice(0, 800) });
    }
  }
  return items.length > 0 ? items : null;
}
