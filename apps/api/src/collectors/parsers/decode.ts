import { gunzipSync, inflateSync, brotliDecompressSync } from "node:zlib";

function sniffCharset(contentType: string | null, buf: Buffer): string {
  const fromHeader = /charset=([\w.+-]+)/i.exec(contentType ?? "")?.[1];
  if (fromHeader) return fromHeader;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return "utf-8";
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return "utf-16le";
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return "utf-16be";
  const head = buf.subarray(0, 4096).toString("latin1");
  const meta = /<meta[^>]+charset=["']?\s*([\w.+-]+)/i.exec(head)?.[1]
    ?? /<meta[^>]+content=["'][^"']*charset=([\w.+-]+)/i.exec(head)?.[1];
  return meta ?? "";
}

function normalizeLabel(label: string): string {
  const cs = label.trim().toLowerCase().replace(/_/g, "-");
  if (!cs) return "utf-8";
  if (cs === "latin1" || cs === "iso-8859-1" || cs === "iso8859-1" || cs === "windows-1252" || cs === "cp1252" || cs === "ansi") return "windows-1252";
  return cs;
}

function maybeDecompress(buf: Buffer): Buffer {
  try {
    if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf);
    if (buf.length >= 2 && buf[0] === 0x78 && (buf[1] === 0x01 || buf[1] === 0x9c || buf[1] === 0xda)) return inflateSync(buf);
  } catch {
    // keep original
  }
  return buf;
}

export function decodeBody(buf: Buffer, contentType: string | null): { text: string; charset: string; decompressed: boolean } {
  const raw = maybeDecompress(buf);
  const charset = normalizeLabel(sniffCharset(contentType, raw));
  let text: string;
  try {
    text = new TextDecoder(charset, { fatal: false }).decode(raw);
  } catch {
    text = new TextDecoder("utf-8", { fatal: false }).decode(raw);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { text, charset, decompressed: raw !== buf };
}

export function tryBrotli(buf: Buffer): Buffer | null {
  try { return brotliDecompressSync(buf); } catch { return null; }
}
