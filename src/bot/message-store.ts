const MAX_STORED_MESSAGES = 200;

export interface StoredMessage {
  timestamp: number;
  source: string;
  text: string;
  firstSeen: number;
  repeats: number;
}

type Waiter = {
  matches: (message: StoredMessage) => boolean;
  resolve: (message: StoredMessage | null) => void;
};

export class MessageStore {
  private readonly messages: StoredMessage[] = [];
  private readonly waiters = new Set<Waiter>();

  addDistinct(source: string, text: string): void {
    const last = this.messages[this.messages.length - 1];

    if (last?.text === text) {
      last.timestamp = Date.now();
      last.repeats += 1;
      return;
    }

    this.add(source, text);
  }

  add(source: string, text: string): void {
    const now = Date.now();
    const message: StoredMessage = { timestamp: now, source, text, firstSeen: now, repeats: 1 };

    this.messages.push(message);
    if (this.messages.length > MAX_STORED_MESSAGES) {
      this.messages.shift();
    }

    for (const waiter of [...this.waiters]) {
      if (waiter.matches(message)) {
        this.waiters.delete(waiter);
        waiter.resolve(message);
      }
    }
  }

  recent(count: number): StoredMessage[] {
    if (count <= 0) {
      return [];
    }
    return this.messages.slice(-Math.min(count, MAX_STORED_MESSAGES));
  }

  get capacity(): number {
    return MAX_STORED_MESSAGES;
  }

  async waitFor(
    matches: (message: StoredMessage) => boolean,
    timeoutMs: number,
  ): Promise<StoredMessage | null> {
    return new Promise((resolve) => {
      const waiter: Waiter = {
        matches,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
      };

      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        resolve(null);
      }, timeoutMs);

      this.waiters.add(waiter);
    });
  }

  abandonWaiters(): void {
    for (const waiter of [...this.waiters]) {
      this.waiters.delete(waiter);
      waiter.resolve(null);
    }
  }
}
