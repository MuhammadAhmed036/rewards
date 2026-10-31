import "dotenv/config";
import { describe, it, expect } from "vitest";
import { registerOwnerAndTenant } from "./tenant";
import { getProgrammeTerms, updateProgrammeTerms } from "./programme";
import { RequestContext } from "../security/permissions";

describe("Terms in more than one language", () => {
  it("saves the shop's terms and translations, raises the version only when something changed, and ignores unknown languages", async () => {
    const stamp = `terms-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const s = await registerOwnerAndTenant({ email: `owner-${stamp}@terms.test`, password: "Password123!", name: "Terms Owner", businessName: `Terms ${stamp}`, slug: stamp, emailVerified: true });
    const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "terms" };

    const start = await getProgrammeTerms(ctx);
    expect(start).toMatchObject({ text: "", translations: {}, version: "1.0" });

    const first = await updateProgrammeTerms(ctx, { text: "No refunds on points.", translations: { es: "No hay reembolsos de puntos.", ur: "  ", fr: "Pas de remboursement", en: "ignored" } });
    expect(first).toEqual({ version: "1.1", changed: true });
    const saved = await getProgrammeTerms(ctx);
    expect(saved.text).toBe("No refunds on points.");
    expect(saved.translations).toEqual({ es: "No hay reembolsos de puntos." }); // blank, unknown and English-as-translation are dropped

    // Saving the same thing again changes nothing
    expect(await updateProgrammeTerms(ctx, { text: "No refunds on points.", translations: { es: "No hay reembolsos de puntos." } })).toMatchObject({ version: "1.1", changed: false });
    expect((await updateProgrammeTerms(ctx, { text: "No refunds on points.", translations: { es: "Sin reembolsos." } })).version).toBe("1.2");

    await expect(updateProgrammeTerms(ctx, { text: "x".repeat(8001), translations: {} })).rejects.toThrow(/under 8,000/);
    await expect(updateProgrammeTerms({ ...ctx, role: "staff" }, { text: "x", translations: {} })).rejects.toThrow(/FORBIDDEN/);
  });
});
