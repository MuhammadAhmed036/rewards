import "dotenv/config";
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { emailOutbox } from "../db/schema";
import { queueEmail, sendEmailNow } from "./email";

describe("Email retries", () => {
  it("sends the new email at once and clears an earlier one that was waiting for a retry", async () => {
    const stamp = Date.now();
    // An email that failed a minute ago and is due again
    const waiting = await queueEmail({ toEmail: `waiting-${stamp}@retry.test`, template: "password_reset", payload: { url: "https://x.test/a" } });
    await db
      .update(emailOutbox)
      .set({
        status: "failed",
        attempts: 1,
        nextAttemptAt: new Date(Date.now() - 60_000),
        lastError: "timeout",
        // The oldest waiting email is retried first, so make this one clearly the oldest
        createdAt: new Date(Date.now() - 365 * 86400_000),
      })
      .where(eq(emailOutbox.id, waiting.id));

    const fresh = await sendEmailNow({ toEmail: `fresh-${stamp}@retry.test`, template: "password_reset", payload: { url: "https://x.test/b" } });
    expect(fresh.sent).toBe(true);

    const [after] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, waiting.id));
    expect(after.status).toBe("sent");
    expect(after.lastError).toBeNull();
  });

  it("does not retry an email that isn't due yet", async () => {
    const stamp = Date.now();
    const later = await queueEmail({ toEmail: `later-${stamp}@retry.test`, template: "password_reset", payload: { url: "https://x.test/c" } });
    await db
      .update(emailOutbox)
      .set({ status: "failed", attempts: 2, nextAttemptAt: new Date(Date.now() + 10 * 60_000) })
      .where(eq(emailOutbox.id, later.id));
    await sendEmailNow({ toEmail: `fresh2-${stamp}@retry.test`, template: "password_reset", payload: { url: "https://x.test/d" } });
    const [after] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, later.id));
    expect(after.status).toBe("failed");
  });
});
