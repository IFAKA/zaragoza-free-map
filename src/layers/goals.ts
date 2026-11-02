import type { LayerId } from '../lib/types'
import { seasonOf } from '../lib/season'

/**
 * Goals: what the person is trying to do. The tab bar has one fixed column per goal, and each goal holds its services as a row of chips.
 * Adding a service = add its id to ONE goal here (and its layer in build.ts). Nothing else. A goal holds at most MAX_SERVICES.
 */
export type GoalId = 'now' | 'move' | 'connect'
export interface GoalConfig { id: GoalId; label: { en: string; es: string }; layers: LayerId[] }
export const MAX_SERVICES = 4

/** Default goal order (a new visitor). The person's own taps re-sort it when the app opens (lib/usage.ts). */
export const GOALS: GoalConfig[] = [
  { id: 'now', label: { en: 'Now', es: 'Ahora' }, layers: ['toilets', 'water', 'pharmacy', 'shelter'] },
  { id: 'move', label: { en: 'Getting around', es: 'Moverse' }, layers: ['bus', 'tram', 'cercanias', 'bizi'] },
  { id: 'connect', label: { en: 'Connect', es: 'Conectar' }, layers: ['wifi', 'charge', 'libraries'] },
]
export const GOAL_IDS: GoalId[] = GOALS.map(g => g.id)
export const goalById = (id: GoalId): GoalConfig => GOALS.find(g => g.id === id)!
export const goalOf = (layer: LayerId): GoalConfig => GOALS.find(g => g.layers.includes(layer)) ?? GOALS[0]

/** The services of a goal, in chip order. Warm indoor places (shelter) come 3rd from 1 Nov to 31 Mar (device date), as the last chip otherwise. */
export function goalServices(goal: GoalConfig, date: Date = new Date()): LayerId[] {
  const rest = goal.layers.filter(l => l !== 'shelter')
  if (!goal.layers.includes('shelter')) return rest
  const at = seasonOf(date) === 'warm' ? Math.min(2, rest.length) : rest.length
  return [...rest.slice(0, at), 'shelter', ...rest.slice(at)]
}

/** The service a goal opens on: the one last used there (if it still belongs to the goal), else its first. A new visitor lands on Ahora > Aseos. */
export function serviceFor(goal: GoalConfig, last: Partial<Record<GoalId, string>>, date: Date = new Date()): LayerId {
  const list = goalServices(goal, date), mem = last[goal.id]
  return (list.find(l => l === mem) ?? list[0])
}
