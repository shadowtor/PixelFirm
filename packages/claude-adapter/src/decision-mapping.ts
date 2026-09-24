// CEO decision -> SDK PermissionResult. Pure, no I/O (signal-detection.ts
// style). The decision is read only for action/note/answers: approve always
// returns the input the runtime parked and showed the CEO, never anything
// that arrived over the wire (D-01).
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { DecisionAction } from "event-schema";
import type { ClassifiedSignal } from "./signal-detection.js";

export interface CeoDecision {
  action: DecisionAction;
  note?: string;
  answers?: Record<string, string>;
}

export interface ParkedCall {
  decisionId: string;
  toolName: string;
  input: Record<string, unknown>;
  kind: ClassifiedSignal["kind"];
}

// D-05 / UI-SPEC "Messages sent to the agent": locked copy.
export const CEO_PREFIX = {
  reject: "[CEO:REJECT]",
  request_changes: "[CEO:REQUEST_CHANGES]",
  more_research: "[CEO:MORE_RESEARCH]",
  discuss: "[CEO:DISCUSS]",
} as const;

const ANSWERS_MISMATCH = "The CEO's answers did not match the questions asked; ask again with AskUserQuestion.";

export function toPermissionResult(decision: CeoDecision, parked: ParkedCall): PermissionResult {
  if (decision.action === "approve") {
    if (parked.toolName !== "AskUserQuestion") return { behavior: "allow", updatedInput: parked.input };
    return { behavior: "deny", message: ANSWERS_MISMATCH };
  }
  return { behavior: "deny", message: CEO_PREFIX[decision.action] };
}
