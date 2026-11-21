/** Garde de forme partagée par les parseurs : un objet, pas un tableau. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
