/**
 * Money utilities for GBP integer pence handling.
 * Rule: Money is strictly stored and manipulated as integer pence. Never use floats.
 */

/**
 * Parses user input into integer pence.
 * Handles "18.70", "£18.70", "18", "0.50", "£0.99"
 */
export function parsePence(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isInteger(input) || input < 0) {
      throw new Error(`Invalid minor amount: ${input}. Must be a non-negative integer.`);
    }
    return input;
  }

  const cleaned = input.trim().replace(/^£\s*/, "").replace(/,/g, "");
  if (!cleaned) return 0;

  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Invalid money string format: "${input}"`);
  }

  const parts = cleaned.split(".");
  const pounds = parseInt(parts[0], 10);
  const pence = parts[1] ? parseInt(parts[1].padEnd(2, "0").slice(0, 2), 10) : 0;

  return pounds * 100 + pence;
}

/**
 * Formats integer pence into standard GBP format (e.g. 1870 -> "£18.70", 50 -> "£0.50")
 */
export function formatPence(pence: number): string {
  if (!Number.isInteger(pence) || pence < 0) {
    throw new Error(`Invalid pence: ${pence}. Must be non-negative integer.`);
  }

  const pounds = Math.floor(pence / 100);
  const remainder = pence % 100;
  return `£${pounds}.${remainder.toString().padStart(2, "0")}`;
}
