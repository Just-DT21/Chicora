export interface SavedReservation {
  reference: string
  phone: string
  name: string
  advance: number
  createdAt: string
  itemNames: string
}

const KEY = 'chicora.reservations.v1'

export function loadReservations(): SavedReservation[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is SavedReservation =>
        entry && typeof entry.reference === 'string' && typeof entry.phone === 'string',
    )
  } catch {
    return []
  }
}

export function saveReservation(entry: SavedReservation) {
  const existing = loadReservations().filter((r) => r.reference !== entry.reference)
  const next = [entry, ...existing].slice(0, 24)
  localStorage.setItem(KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('chicora:reservations'))
  return next
}

export function removeReservation(reference: string) {
  const next = loadReservations().filter((r) => r.reference !== reference)
  localStorage.setItem(KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('chicora:reservations'))
  return next
}
