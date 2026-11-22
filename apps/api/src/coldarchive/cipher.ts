/** Self-contained AES-256-GCM envelope: no external service, no paid tier. */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const MAGIC = Buffer.from("RADARCOLD1", "ascii");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const HEADER_BYTES = MAGIC.length + SALT_BYTES + IV_BYTES + TAG_BYTES;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_BYTES, { N: 16384, r: 8, p: 1 });
}

/** Layout: magic | salt | iv | auth tag | ciphertext. */
export function encrypt(payload: Buffer, passphrase: string): Buffer {
  if (!passphrase) throw new Error("cold archive passphrase is required");
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  const body = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export function decrypt(envelope: Buffer, passphrase: string): Buffer {
  if (envelope.subarray(0, MAGIC.length).toString("ascii") !== MAGIC.toString("ascii")) {
    throw new Error("not a cold archive file");
  }
  if (envelope.length <= HEADER_BYTES) throw new Error("truncated cold archive file");
  let at = MAGIC.length;
  const salt = envelope.subarray(at, (at += SALT_BYTES));
  const iv = envelope.subarray(at, (at += IV_BYTES));
  const tag = envelope.subarray(at, (at += TAG_BYTES));
  const body = envelope.subarray(at);

  const decipher = createDecipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new Error("cold archive authentication failed");
  }
}
