import { describe, it, expect } from "vitest";
import { parsePence, formatPence } from "./money";

describe("Money Utilities (GBP Integer Pence) (M2)", () => {
  it("parses valid GBP string amounts accurately without float drift", () => {
    expect(parsePence("£18.70")).toBe(1870);
    expect(parsePence("18.70")).toBe(1870);
    expect(parsePence("£0.50")).toBe(50);
    expect(parsePence("£100")).toBe(10000);
    expect(parsePence("0.99")).toBe(99);
    expect(parsePence("1,250.50")).toBe(125050);
  });

  it("handles integer inputs directly", () => {
    expect(parsePence(1870)).toBe(1870);
    expect(parsePence(0)).toBe(0);
  });

  it("formats integer pence into GBP strings", () => {
    expect(formatPence(1870)).toBe("£18.70");
    expect(formatPence(50)).toBe("£0.50");
    expect(formatPence(5)).toBe("£0.05");
    expect(formatPence(0)).toBe("£0.00");
    expect(formatPence(10000)).toBe("£100.00");
  });

  it("throws on invalid currency strings or negative numbers", () => {
    expect(() => parsePence("-18.70")).toThrow();
    expect(() => parsePence("abc")).toThrow();
    expect(() => parsePence(-50)).toThrow();
    expect(() => formatPence(-100)).toThrow();
  });
});
