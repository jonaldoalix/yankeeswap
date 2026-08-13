export interface SseClient {
  write(chunk: string): unknown;
  on(event: "close", listener: () => void): unknown;
}

export class EventBus {
  private readonly clients = new Set<SseClient>();

  get size(): number {
    return this.clients.size;
  }

  subscribe(client: SseClient): () => void {
    this.clients.add(client);
    const onClose = () => {
      this.clients.delete(client);
    };
    client.on("close", onClose);
    return () => {
      this.clients.delete(client);
    };
  }

  emit(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of Array.from(this.clients)) {
      try {
        client.write(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }
}
