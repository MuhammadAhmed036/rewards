import { describe, it, expect } from "vitest";
import { renderEmailTemplate, type EmailTemplate } from "./email";

describe("Emails can't be used to inject markup", () => {
  const hostile = `<img src=x onerror=alert(1)> Tom & Jerry's "Cafe" <a href="https://evil.example">click</a>`;
  const templates: Array<[EmailTemplate, Record<string, unknown>]> = [
    ["welcome", { businessName: hostile, memberNumber: hostile, earningRule: hostile, hubUrl: "https://app.test/b/shop", unsubscribeUrl: "https://app.test/u" }],
    ["staff_invitation", { businessName: hostile, role: hostile, isNewAccount: true, url: "https://app.test/accept" }],
    ["reward_unlocked", { businessName: hostile, rewardTitle: hostile, hubUrl: "https://app.test/b/shop" }],
    ["redemption_receipt", { businessName: hostile, rewardTitle: hostile }],
    ["password_reset", { url: "https://app.test/reset?token=abc" }],
    ["points_expiring", { businessName: hostile, expiresOn: hostile, hubUrl: "https://app.test/b/shop" }],
  ];

  for (const [template, payload] of templates) {
    it(`${template}: shop and customer text is escaped in the HTML, and left as typed in the plain text`, () => {
      const { html, text } = renderEmailTemplate(template, payload);
      expect(html).not.toContain("<img src=x");
      expect(html).not.toContain('<a href="https://evil.example">');
      expect(html).not.toMatch(/onerror=alert\(1\)>/);
      if (template !== "password_reset") expect(html).toContain("&lt;img src=x");
      // Our own links still work
      if (payload.url) expect(html).toContain(String(payload.url));
      if (payload.hubUrl) expect(html).toContain(String(payload.hubUrl));
      // Plain text isn't HTML, so it keeps the words as typed (no "&amp;" in a text email)
      expect(text).not.toContain("&amp;");
    });
  }

  it("offers escape their text once, not twice", () => {
    const { html } = renderEmailTemplate("campaign", { subject: "Sale & offers", body: "2 < 3 & more", businessName: "Tom & Jerry", hubUrl: "https://app.test/b/shop", unsubscribeUrl: "https://app.test/u" });
    expect(html).toContain("Sale &amp; offers");
    expect(html).not.toContain("&amp;amp;");
    expect(html).toContain("2 &lt; 3 &amp; more");
  });
});
