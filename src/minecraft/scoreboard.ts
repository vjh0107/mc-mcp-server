import { toPlainText } from './text.ts';

export interface ScoreEntry {
  name: string;
  score: number;
}

interface ScorePacket {
  itemName?: string;
  scoreName?: string;
  value?: number;
  display_name?: unknown;
}

interface ResetPacket {
  entity_name?: string;
  objective_name?: string | null;
}

interface ObjectivePacket {
  name?: string;
  action?: number;
}

export interface PacketSource {
  on: (event: string, listener: (packet: never) => void) => unknown;
}

const OBJECTIVE_REMOVED = 1;

export class ScoreTracker {
  private readonly objectives = new Map<string, Map<string, ScoreEntry>>();

  attach(client: PacketSource): void {
    client.on('scoreboard_score', ((packet: ScorePacket) => this.set(packet)) as never);
    client.on('reset_score', ((packet: ResetPacket) => this.reset(packet)) as never);
    client.on('scoreboard_objective', ((packet: ObjectivePacket) => {
      if (packet.action === OBJECTIVE_REMOVED && packet.name !== undefined) {
        this.objectives.delete(packet.name);
      }
    }) as never);
  }

  entriesFor(objective: string): ScoreEntry[] {
    return [...(this.objectives.get(objective)?.values() ?? [])]
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  private set(packet: ScorePacket): void {
    const { itemName, scoreName, value } = packet;

    if (itemName === undefined || scoreName === undefined || value === undefined) {
      return;
    }

    const entries = this.objectives.get(scoreName) ?? new Map<string, ScoreEntry>();
    const label = toPlainText(packet.display_name);

    entries.set(itemName, { name: label === '' ? toPlainText(itemName) : label, score: value });
    this.objectives.set(scoreName, entries);
  }

  private reset(packet: ResetPacket): void {
    const { entity_name: entity, objective_name: objective } = packet;

    if (entity === undefined) {
      return;
    }

    if (objective === undefined || objective === null) {
      for (const entries of this.objectives.values()) {
        entries.delete(entity);
      }
      return;
    }

    this.objectives.get(objective)?.delete(entity);
  }
}
