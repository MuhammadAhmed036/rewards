import crypto from "crypto";
import { env } from "./env";

// Webhook signing secrets must be readable again to sign with, so they are encrypted at rest (AES-256-GCM)
// with a key derived from AUTH_SECRET, not stored as plain text.
const key = () => crypto.createHash("sha256").update(`secret-box:${env.AUTH_SECRET}`).digest();

export function sealSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function openSecret(sealed: string): string {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
