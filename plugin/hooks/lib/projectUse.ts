// Consumo per progetto: ogni sessione di Claude Code registra quanto spende
// (il costo in dollari che il motore misura, `cost.usd`) insieme al nome della
// sua cartella, in una voce dello store tutta sua. Sommando le voci di tutte le
// sessioni nella finestra di 5 ore si ottiene la quota di ciascun progetto. È
// una stima: il limite non è il costo, ma lo segue da vicino; le chat su
// claude.ai non passano di qui.

/** Prefisso delle voci dello store, una per sessione. */
export const PROJECT_KEY_PREFIX = 'proj:'

/** Quanto tenere gli eventi: la finestra di 5 ore più un margine. */
export const PROJECT_KEEP_MS = 6 * 3_600_000

/** Eventi più vicini di così si uniscono in uno solo (store piccolo). */
const MERGE_MS = 60_000

/** Progetti mostrati per nome; gli altri finiscono in "altri". */
export const PROJECT_TOP = 4

/** [quando, dollari spesi] */
export type ProjectEvent = [number, number]

export type ProjectLog = { project: string; events: ProjectEvent[] }

export type ProjectRow = { project: string; percent: number; isOthers?: boolean }

export type ProjectShare = { from: number; rows: ProjectRow[] }

/** "C:\\Users\\me\\Desktop\\MyApp" → "MyApp"; "/home/me/app/" → "app". */
export function projectName(cwd: string): string {
  const parts = cwd.split(/[\\/]+/).filter(p => p !== '')

  return parts.length === 0 ? cwd || '?' : parts[parts.length - 1]!
}

/** Aggiunge una spesa al registro della sessione e toglie gli eventi vecchi. */
export function appendCost(log: ProjectLog, at: number, usd: number): ProjectLog {
  const keepFrom = at - PROJECT_KEEP_MS
  const events = log.events.filter(([t]) => t >= keepFrom)
  const last = events[events.length - 1]
  if (last !== undefined && at - last[0] < MERGE_MS) {
    events[events.length - 1] = [last[0], last[1] + usd]
  } else {
    events.push([at, usd])
  }

  return { project: log.project, events }
}

/** Legge una voce dello store; undefined se non è un registro valido. */
export function parseProjectLog(value: unknown): ProjectLog | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const { project, events } = value as Partial<ProjectLog>
  if (typeof project !== 'string' || !Array.isArray(events)) return undefined
  const ok = events.filter(
    (e): e is ProjectEvent =>
      Array.isArray(e) && e.length === 2 && Number.isFinite(e[0]) && Number.isFinite(e[1]) && e[1] > 0,
  )

  return { project, events: ok }
}

/** Ultimo evento del registro (0 se vuoto): serve a ripulire le sessioni chiuse. */
export function lastActivity(log: ProjectLog): number {
  return log.events.reduce((m, [t]) => Math.max(m, t), 0)
}

/**
 * Quota di ciascun progetto della spesa dal momento `from` in poi, sommando i
 * registri di tutte le sessioni. Percentuali intere che sommano 100; i progetti
 * oltre i primi PROJECT_TOP diventano una riga "altri".
 */
export function aggregateProjects(logs: readonly ProjectLog[], from: number): ProjectShare {
  const byProject = new Map<string, number>()
  for (const log of logs) {
    const spent = log.events.reduce((s, [t, usd]) => (t >= from ? s + usd : s), 0)
    if (spent > 0) byProject.set(log.project, (byProject.get(log.project) ?? 0) + spent)
  }
  const total = [...byProject.values()].reduce((a, b) => a + b, 0)
  if (total <= 0) return { from, rows: [] }
  const sorted = [...byProject.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const top = sorted.slice(0, PROJECT_TOP)
  const rest = sorted.slice(PROJECT_TOP).reduce((s, [, v]) => s + v, 0)
  const raw = top.map(([project, v]) => ({ project, value: (v / total) * 100 }))
  if (rest > 0) raw.push({ project: '', value: (rest / total) * 100 })

  // Arrotonda mantenendo la somma a 100 (metodo dei resti più grandi).
  const floors = raw.map(r => Math.floor(r.value))
  let left = 100 - floors.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => [r.value - floors[i]!, i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (left <= 0) break
    floors[i]! += 1
    left -= 1
  }

  return {
    from,
    rows: raw.map((r, i) => (r.project === '' ? { project: '', percent: floors[i]!, isOthers: true } : { project: r.project, percent: floors[i]! })),
  }
}
