import { scrypt, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = parts[1];
  const hash = Buffer.from(parts[2], "hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(hash, derived);
}

export function newToken(): string {
	return randomBytes(32).toString("hex");
}

/**
 * Les tokens de session ne dorment pas en clair en base : on n'y stocke que
 * leur SHA-256. Une fuite de la table `app_session` ne permet alors pas de
 * détourner une session — il faudrait inverser le hash.
 */
export function hashSessionToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}
