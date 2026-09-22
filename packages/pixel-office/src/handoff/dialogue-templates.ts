// Deterministic, template-based handoff dialogue (HANDOFF-02). Zero network
// or LLM call surface anywhere in this file — a static template map with
// placeholder interpolation only. Never phrase these plainly-functional
// strings to imply spontaneous/live AI generation (kept transparency
// prohibition, 05-04-PLAN.md): no exclamation marks, no simulated
// personality, no first-person "I" framing.
const DIALOGUE_TEMPLATES: Record<"requested" | "accepted", (taskTitle: string, toAgentName: string) => string> = {
  requested: (taskTitle, toAgentName) => `Handing off "${taskTitle}" to ${toAgentName}`,
  accepted: (taskTitle, toAgentName) => `${toAgentName} accepts "${taskTitle}"`,
};

// ponytail: caps sized to one line on the native 320px canvas at ~6.6px per
// monospace character (longest line 46 code points). Raise them when a larger
// render target exists (Phase 7's 1920x1080 overlay). Stream-safety filtering
// of the title is not done here — that is Phase 7 (SAFE-01/02); this only
// bounds length (05-13, T-05-13-01).
export const MAX_DIALOGUE_TITLE_CHARS = 16;
export const MAX_DIALOGUE_NAME_CHARS = 12;

/** Cut by code point (never splits a surrogate pair), ending in U+2026 when cut. */
function capForDialogue(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : value;
}

/**
 * Resolves handoff dialogue text. Pure function — taskTitle/toAgentName are
 * the ONLY interpolated values, each length-capped before interpolation.
 * Callers must pass the task's plain `title` field (TaskState.title), never
 * payload/prompt/diff content (kept privacy prohibition, 05-04-PLAN.md).
 */
export function resolveHandoffDialogue(kind: "requested" | "accepted", taskTitle: string, toAgentName: string): string {
  return DIALOGUE_TEMPLATES[kind](
    capForDialogue(taskTitle, MAX_DIALOGUE_TITLE_CHARS),
    capForDialogue(toAgentName, MAX_DIALOGUE_NAME_CHARS),
  );
}
