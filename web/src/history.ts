export type Entry<T> = { state: T; label: string }
export type History<T> = { past: readonly Entry<T>[]; present: T; future: readonly Entry<T>[] }

export function fresh<T>(present: T): History<T> {
  return { past: [], present, future: [] }
}

export function commit<T>(history: History<T>, next: T, label: string): History<T> {
  if (next === history.present) return history
  return { past: [...history.past, { state: history.present, label }], present: next, future: [] }
}

export function amend<T>(history: History<T>, next: T): History<T> {
  return { ...history, present: next }
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1)
  if (previous === undefined) return history
  return { past: history.past.slice(0, -1), present: previous.state, future: [{ state: history.present, label: previous.label }, ...history.future] }
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future
  if (next === undefined) return history
  return { past: [...history.past, { state: history.present, label: next.label }], present: next.state, future: rest }
}

export function labels<T>(history: History<T>): string[] {
  return history.past.map(({ label }) => label)
}
