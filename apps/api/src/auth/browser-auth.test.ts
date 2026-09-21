process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5434/pixelfirm_test";
process.env.CREDENTIAL_PEPPER = "test-pepper";
process.env.BOOTSTRAP_SECRET = "test-bootstrap";
process.env.BROWSER_ACCESS_TOKEN = "test-browser-access-token";

import { describe, it, expect, vi, beforeAll } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { authenticateBrowser as authenticateBrowserType } from "./browser-auth.js";

// Static imports hoist above the process.env assignments above (ESM
// semantics) — ./browser-auth.js transitively imports ../env.js, which
// parses process.env at module-load time. Load it dynamically after the
// assignments run instead (same pattern as credentials.test.ts).
let authenticateBrowser: typeof authenticateBrowserType;

beforeAll(async () => {
  ({ authenticateBrowser } = await import("./browser-auth.js"));
});

function makeRequest(token?: string): FastifyRequest {
  return { query: token === undefined ? {} : { token } } as unknown as FastifyRequest;
}

/** Mocks kept as plain vi.fn() references (not read back off the typed
 * FastifyReply) — chaining through the real FastifyReply.code()'s own
 * overload signature defeats a `.code(...).send.mock` read otherwise. */
function makeReply(): { reply: FastifyReply; codeMock: ReturnType<typeof vi.fn>; sendMock: ReturnType<typeof vi.fn> } {
  const sendMock = vi.fn();
  const codeMock = vi.fn(() => ({ send: sendMock }));
  const reply = { code: codeMock, send: sendMock } as unknown as FastifyReply;
  return { reply, codeMock, sendMock };
}

describe("authenticateBrowser", () => {
  it("rejects with 401 when no token query param is present", async () => {
    const { reply, codeMock, sendMock } = makeReply();
    await authenticateBrowser(makeRequest(), reply);
    expect(codeMock).toHaveBeenCalledWith(401);
    expect(sendMock).toHaveBeenCalledWith({ error: "unauthorized" });
  });

  it("rejects a wrong token with the byte-identical body/status as no token (enumeration resistance)", async () => {
    const noToken = makeReply();
    await authenticateBrowser(makeRequest(), noToken.reply);

    const wrongToken = makeReply();
    await authenticateBrowser(makeRequest("wrong-token-wrong-token"), wrongToken.reply);

    expect(wrongToken.codeMock).toHaveBeenCalledWith(401);
    expect(wrongToken.codeMock.mock.calls).toEqual(noToken.codeMock.mock.calls);
    expect(wrongToken.sendMock.mock.calls).toEqual(noToken.sendMock.mock.calls);
  });

  it("accepts the correct token: reply.code is never called, request.browserAuthed is true", async () => {
    const { reply, codeMock } = makeReply();
    const request = makeRequest("test-browser-access-token");
    await authenticateBrowser(request, reply);
    expect(codeMock).not.toHaveBeenCalled();
    expect(request.browserAuthed).toBe(true);
  });
});
