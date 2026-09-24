// The CEO room's waiting queue (06-07, CEO-01, D-10): an agent whose status is
// waiting_for_ceo walks to the lowest free slot and stands there; any other
// status releases the slot and walks it home. The canvas stays a pure consumer
// of AgentStatus, and the walk is Phase 5's (walkCharacterTo + blockedTilesFor),
// not a second walker. Same circular-import note as handoff-choreography.ts:
// "../index.js" is only read inside function bodies.
import { AgentStatus } from "event-schema";
import { walkCharacterTo } from "../engine/characters.js";
import { blockedTilesFor } from "../handoff/handoff-choreography.js";
import { getTileMap } from "../index.js";
import { CEO_QUEUE_SLOTS } from "../layout/officeLayout.js";
import type { Character } from "../types.js";

/** agentId -> slot index into CEO_QUEUE_SLOTS. */
const occupants = new Map<string, number>();
// ponytail: a fifth waiting agent waits at its own desk for its whole wait, even
// if a slot frees up meanwhile (D-10: no shuffling, no aisle queue). Upgrade
// path: a larger room with more slots.
const overflow = new Set<string>();

/** Moves `ch` in or out of the queue for its new status. Never shuffles. */
export function syncCeoQueue(ch: Character, status: AgentStatus): void {
  if (status === AgentStatus.WAITING_FOR_CEO) {
    if (occupants.has(ch.id) || overflow.has(ch.id)) return;
    const taken = new Set(occupants.values());
    const index = CEO_QUEUE_SLOTS.findIndex((_, i) => !taken.has(i));
    if (index === -1) {
      overflow.add(ch.id);
      return;
    }
    occupants.set(ch.id, index);
    const slot = CEO_QUEUE_SLOTS[index];
    walkCharacterTo(ch, slot.col, slot.row, getTileMap(), blockedTilesFor(ch, slot));
    return;
  }
  overflow.delete(ch.id);
  if (!occupants.delete(ch.id)) return;
  const home = { col: ch.seatCol, row: ch.seatRow };
  walkCharacterTo(ch, home.col, home.row, getTileMap(), blockedTilesFor(ch, home));
}

/** Frees whatever the agent held (it went offline). */
export function releaseCeoSlot(agentId: string): void {
  occupants.delete(agentId);
  overflow.delete(agentId);
}

/** Read-only view: agentId -> slot index. */
export function getCeoQueueOccupants(): ReadonlyMap<string, number> {
  return occupants;
}

export function _resetCeoQueueForTests(): void {
  occupants.clear();
  overflow.clear();
}
