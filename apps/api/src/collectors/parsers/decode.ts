import { decompressBounded, NetworkLimitError } from "../../security/network.js";

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
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) return decompressBounded(buf, "gzip");
  if (buf.length >= 2 && buf[0] === 0x78 && (buf[1] === 0x01 || buf[1] === 0x9c || buf[1] === 0xda)) {
    return decompressBounded(buf, "deflate");
  }
  return buf;
}

export function decodeBody(buf: Buffer, contentType: string | null): { text: string; charset: string; decompressed: boolean; uncertain: boolean } {
  const raw = maybeDecompress(buf);
  const sniffed = sniffCharset(contentType, raw);
  const declared = sniffed.trim() !== "";
  let charset = normalizeLabel(sniffed || "utf-8");
  let text: string;
  let uncertain = false;
  if (!declared) {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
      charset = "utf-8";
      if (text.includes("\uFFFD")) uncertain = true;
    } catch {
      text = new TextDecoder("windows-1252", { fatal: false }).decode(raw);
      charset = "windows-1252";
      uncertain = true;
    }
  } else {
    try {
      text = new TextDecoder(charset, { fatal: false }).decode(raw);
    } catch {
      text = new TextDecoder("utf-8", { fatal: false }).decode(raw);
      charset = "utf-8";
      uncertain = true;
    }
    if (text.includes("\uFFFD")) uncertain = true;
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { text, charset, decompressed: raw !== buf, uncertain };
}

export function tryBrotli(buf: Buffer): Buffer | null {
  try {
    return decompressBounded(buf, "brotli");
  } catch (error) {
    if (error instanceof NetworkLimitError) throw error;
    return null;
  }
}
