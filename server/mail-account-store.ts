import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Secret persistence for mail accounts. The metadata lives in SQLite; tokens
 * and passwords live only in this authenticated encrypted envelope.
 */
export type MailSecret = { provider: "gmail" | "zoho"; email: string; displayName?: string; accessToken?: string; expiresAt?: number; refreshToken?: string; apiDomain?: string; accountId?: string; scopes?: string[]; password?: string; smtpHost?: string; smtpPort?: number; imapHost?: string; imapPort?: number };

type Envelope = { version: 1; algorithm: "aes-256-gcm"; iv: string; tag: string; ciphertext: string };
type SecretRecord = MailSecret & { id: string; updatedAt: string };

function keyBytes(key: string): Buffer {
  const trimmed = key.trim();
  if (!trimmed) throw new Error("MAIL_CREDENTIAL_ENCRYPTION_KEY is not configured.");
  const decoded = Buffer.from(trimmed, "base64");
  return (decoded.length === 32 && /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) ? decoded : createHash("sha256").update(trimmed).digest();
}

export class EncryptedMailAccountStore {
  constructor(private readonly path: string, private readonly configuredKey = process.env.MAIL_CREDENTIAL_ENCRYPTION_KEY ?? "") {}

  private async read(): Promise<SecretRecord[]> {
    try {
      const envelope = JSON.parse(await readFile(this.path, "utf8")) as Envelope;
      if (envelope.version !== 1 || envelope.algorithm !== "aes-256-gcm") throw new Error("Unsupported mail credential envelope.");
      const decipher = createDecipheriv("aes-256-gcm", keyBytes(this.configuredKey), Buffer.from(envelope.iv, "base64"));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8")) as SecretRecord[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async write(records: SecretRecord[]): Promise<void> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", keyBytes(this.configuredKey), iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(records), "utf8"), cipher.final()]);
    const envelope: Envelope = { version: 1, algorithm: "aes-256-gcm", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(envelope), { mode: 0o600 });
    await chmod(temp, 0o600);
    await rename(temp, this.path);
  }

  async get(id: string): Promise<MailSecret | null> { const record = (await this.read()).find((item) => item.id === id); if (!record) return null; const { id: _id, updatedAt: _updatedAt, ...secret } = record; return secret; }
  async upsert(id: string, secret: MailSecret): Promise<void> {
    const records = await this.read();
    const next = { ...secret, id, updatedAt: new Date().toISOString() };
    const index = records.findIndex((record) => record.id === id);
    if (index >= 0) records[index] = next; else records.push(next);
    await this.write(records);
  }
  async delete(id: string): Promise<void> { await this.write((await this.read()).filter((record) => record.id !== id)); }
  async hasConfiguredKey(): Promise<boolean> { try { keyBytes(this.configuredKey); return true; } catch { return false; } }
}
