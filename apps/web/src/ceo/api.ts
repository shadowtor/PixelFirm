// Same-origin requests only: the Cloudflare Access cookie rides along and no token is ever
// put in a URL. Every POST is JSON with X-PixelFirm-CSRF (the server's requireCsrf, T-06-10-01).
import type { DecisionAction } from "event-schema";

export type Me = { ok: true; email: string; devBypass: boolean } | { ok: false; status: number; reason: string };

export async function fetchMe(): Promise<Me> {
  try {
    const res = await fetch("/ceo/api/me", { credentials: "same-origin", headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false, status: res.status, reason: `HTTP ${res.status}` };
    const body = (await res.json()) as { email?: unknown; devBypass?: unknown };
    if (typeof body.email !== "string") return { ok: false, status: res.status, reason: "unexpected response" };
    return { ok: true, email: body.email, devBypass: body.devBypass === true };
  } catch (error) {
    return { ok: false, status: 0, reason: error instanceof Error ? error.message : "network error" };
  }
}

export type PostResult = { ok: true } | { ok: false; status: number; reason: string };

async function post(path: string, body: object): Promise<PostResult> {
  try {
    const res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-PixelFirm-CSRF": "1" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const error = ((await res.json().catch(() => ({}))) as { error?: unknown }).error;
    return { ok: false, status: res.status, reason: typeof error === "string" ? error : `HTTP ${res.status}` };
  } catch (error) {
    return { ok: false, status: 0, reason: error instanceof Error ? error.message : "network error" };
  }
}

export type DecisionBody = { action: DecisionAction; note?: string; answers?: Record<string, string> };

export const postDecision = (decisionId: string, body: DecisionBody) =>
  post(`/ceo/api/decisions/${encodeURIComponent(decisionId)}`, body);

// Bodiless on the server, but requireCsrf wants JSON: send {} (06-04).
export const postResume = (taskId: string) => post(`/ceo/api/tasks/${encodeURIComponent(taskId)}/resume`, {});
