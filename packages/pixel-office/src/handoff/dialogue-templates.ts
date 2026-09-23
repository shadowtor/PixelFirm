// Deterministic, template-based handoff dialogue (HANDOFF-02). Zero network
// or LLM call surface anywhere in this file — a static template map with
// placeholder interpolation only. Never phrase these plainly-functional
// strings to imply spontaneous/live AI generation (kept transparency
// prohibition, 05-04-PLAN.md): no exclamation marks, no simulated
// personality, no first-person "I" framing.
//
// Both lines are VERB-LED (05-40, G-05-1b): a line that opens with the action
// still reads as a handoff when one interpolated value ends in an ellipsis.
// The previous requested line joined two capped values with a bare U+2192,
// which is the debug-banner shape the UAT round rejected. Each entry branches
// on an ABSENT title, so a task with no registered title yields a complete
// sentence — never a placeholder and never its identifier.
const DIALOGUE_TEMPLATES: Record<"requested" | "accepted", (taskTitle: string | null, toAgentName: string) => string> =
  {
    requested: (taskTitle, toAgentName) =>
      taskTitle === null ? `hands off to ${toAgentName}` : `hands ${taskTitle} to ${toAgentName}`,
    accepted: (taskTitle, toAgentName) =>
      taskTitle === null ? `${toAgentName} accepts the handoff` : `${toAgentName} accepts ${taskTitle}`,
  };

// ponytail: the budget is the REQUESTED line at both caps — "hands " (6) +
// title (14) + " to " (4) + name (10) = 34 code points, about 108 world px at
// 05-28's 5px bubble font, inside the 110 px ceiling the templates test
// asserts. The accepted line is shorter (10 + " accepts " 9 + 14 = 33), and
// every null-title line is shorter still. Raising either cap needs
// MAX_DIALOGUE_LINE_CHARS and that px budget raised with it, and a wider
// layout to spend it in. Stream-safety filtering of the title is not done
// here, that is Phase 7 (SAFE-01/02); this only bounds length (05-13,
// T-05-13-01).
export const MAX_DIALOGUE_TITLE_CHARS = 14;
export const MAX_DIALOGUE_NAME_CHARS = 10;
export const MAX_DIALOGUE_LINE_CHARS = 34;

/** Cut by code point (never splits a surrogate pair), ending in U+2026 when cut. */
function capForDialogue(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : value;
}

/**
 * A title with its surrounding whitespace removed, or null when none is known.
 * - Blank means "no title known" (05-41, CR-01): an empty or whitespace-only
 *   title reads exactly like an absent one, never as a present value.
 * - Nullish coalescing only catches undefined, and task.created's title is an
 *   unconstrained `z.string()`, so a blank title arrives as a present string.
 * - This is the one place the rule is written: `resolveHandoffDialogue` and
 *   `getActiveHandoffs` both route through it.
 */
export function titleOrNull(title: string | null | undefined): string | null {
  const trimmed = title?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Resolves handoff dialogue text. Pure function — taskTitle/toAgentName are
 * the ONLY interpolated values, each length-capped before interpolation.
 * Callers must pass the task's plain `title` field (TaskState.title), never
 * payload/prompt/diff content (kept privacy prohibition, 05-04-PLAN.md), and
 * `null` when no title is known — never a task id, which is not a title
 * (05-40, G-05-1b). A blank string is treated exactly like null (`titleOrNull`,
 * 05-41, CR-01).
 */
export function resolveHandoffDialogue(
  kind: "requested" | "accepted",
  taskTitle: string | null,
  toAgentName: string,
): string {
  const title = titleOrNull(taskTitle);
  return DIALOGUE_TEMPLATES[kind](
    title === null ? null : capForDialogue(title, MAX_DIALOGUE_TITLE_CHARS),
    capForDialogue(toAgentName, MAX_DIALOGUE_NAME_CHARS),
  );
}
