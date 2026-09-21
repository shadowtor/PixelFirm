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

/**
 * Resolves handoff dialogue text. Pure function — taskTitle/toAgentName are
 * the ONLY interpolated values. Callers must pass the task's plain `title`
 * field (TaskState.title), never payload/prompt/diff content (kept privacy
 * prohibition, 05-04-PLAN.md).
 */
export function resolveHandoffDialogue(kind: "requested" | "accepted", taskTitle: string, toAgentName: string): string {
  return DIALOGUE_TEMPLATES[kind](taskTitle, toAgentName);
}
