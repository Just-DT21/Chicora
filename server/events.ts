/** Tiny SSE hub used for live admin booking notifications. */
class Hub {
  private clients = new Set<{ id: string; res: import('express').Response }>()

  add(res: import('express').Response) {
    const id = Math.random().toString(36).slice(2)
    const entry = { id, res }
    this.clients.add(entry)
    res.on('close', () => {
      this.clients.delete(entry)
    })
    return id
  }

  broadcast(event: string, payload: unknown) {
    const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
    for (const client of this.clients) {
      try {
        client.res.write(frame)
      } catch {
        this.clients.delete(client)
      }
    }
  }

  get size() {
    return this.clients.size
  }
}

export const hub = new Hub()

export function notifyBooking(event: string, booking: unknown) {
  hub.broadcast(event, { booking, at: new Date().toISOString() })
}
