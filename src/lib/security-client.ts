"use client";

/**
 * Browser side of the two "prove it is you" steps:
 *  - sign-in with an emailed code, for people who turned that on
 *  - re-confirming a password or code before a sensitive action (exports, points changes, team changes)
 * Pages call loginRequest() / ensureRecentAuth(); the dialog itself lives in <SecurityDialogs />.
 */

export type LoginResult = { res: { ok: boolean; status: number }; json: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type SecurityDialog =
  | { kind: "login-code"; challenge: string; emailHint: string; done: (result: LoginResult) => void }
  | { kind: "reauth"; hasPassword: boolean; done: (ok: boolean) => void }
  | null;

let current: SecurityDialog = null;
const listeners = new Set<() => void>();

export const securityDialogStore = {
  get: () => current,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  set(next: SecurityDialog) {
    current = next;
    listeners.forEach((l) => l());
  },
};

/** Same as posting to /api/v1/auth/login, but asks for the emailed code when the account needs one. */
export async function loginRequest(body: Record<string, unknown>): Promise<LoginResult> {
  const res = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (res.ok && json.data?.mfaRequired) {
    return new Promise<LoginResult>((resolve) => {
      securityDialogStore.set({
        kind: "login-code",
        challenge: json.data.challenge,
        emailHint: json.data.emailHint,
        done: (result) => {
          securityDialogStore.set(null);
          resolve(result);
        },
      });
    });
  }
  return { res: { ok: res.ok, status: res.status }, json };
}

/** True once this session has confirmed its password or a code recently; asks the person if it has not. */
export async function ensureRecentAuth(): Promise<boolean> {
  const res = await fetch("/api/v1/auth/reauth", { cache: "no-store" });
  if (!res.ok) return false;
  const { data } = await res.json();
  if (data.recent) return true;
  return new Promise<boolean>((resolve) => {
    securityDialogStore.set({
      kind: "reauth",
      hasPassword: data.hasPassword,
      done: (ok) => {
        securityDialogStore.set(null);
        resolve(ok);
      },
    });
  });
}
