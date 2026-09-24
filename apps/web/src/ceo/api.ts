// Same-origin requests only: the Cloudflare Access cookie rides along and no token is ever
// put in a URL. postDecision and postResume arrive in 06-10.

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
