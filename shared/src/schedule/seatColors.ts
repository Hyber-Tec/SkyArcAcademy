import type { SeatKind } from './classes'

/**
 * A seat's colours on the schedule: the academy's sheets colour each student by level, and make-ups, practice and
 * trials by their label. The owner asked for the sheets' own colours, lighter (2026-10-26), so these are gentle tints
 * of them; dark mode has a dark wash of each. `ink` is the text on it, `dot` a stronger tone for thin marks.
 */
export interface SeatColor {
  bg: string
  ink: string
  dot: string
  darkBg: string
  darkInk: string
}

/** The sheets' legend, by level (the academy's default levels). */
export const LEVEL_COLORS: Readonly<Record<string, SeatColor>> = {
  Discovery: { bg: '#dde9f6', ink: '#1f4b73', dot: '#9fc4e4', darkBg: '#3c4043', darkInk: '#d6e7f6' },
  Scout: { bg: '#fff4d6', ink: '#6b5312', dot: '#ecd27e', darkBg: '#3c3a34', darkInk: '#fbecc2' },
  Hunter: { bg: '#d3e7c9', ink: '#2c5420', dot: '#86b96f', darkBg: '#304228', darkInk: '#c3e2b5' },
  'Hunter+': { bg: '#e8f3e4', ink: '#2f5527', dot: '#a9cf9b', darkBg: '#363935', darkInk: '#dcecd6' },
  Marksman: { bg: '#f9e7b0', ink: '#5c4500', dot: '#e8bd3c', darkBg: '#50431e', darkInk: '#f6dc8c' },
  'Marksman+': { bg: '#fff1c6', ink: '#5e4a04', dot: '#f1d27a', darkBg: '#3c382c', darkInk: '#fde9b0' },
  'Sharp Shooter': { bg: '#e9e4f4', ink: '#3d3168', dot: '#ab9fd1', darkBg: '#3a393d', darkInk: '#ded8ee' },
  Expert: { bg: '#f7dabd', ink: '#74390a', dot: '#e3a065', darkBg: '#513920', darkInk: '#f2c08e' },
  Precision: { bg: '#f7d7d7', ink: '#6e1d1d', dot: '#e08f8f', darkBg: '#4e3939', darkInk: '#f4bcbc' },
}

/** Levels the academy adds later get these, by their place in its list. */
const MORE: readonly SeatColor[] = [
  { bg: '#d9f0ee', ink: '#1d5752', dot: '#7cc4bc', darkBg: '#2c3f3d', darkInk: '#c4e8e4' },
  { bg: '#f6dcea', ink: '#6b2148', dot: '#d98fb6', darkBg: '#46323d', darkInk: '#f0c4dc' },
  { bg: '#e2ecd0', ink: '#43521c', dot: '#a9c278', darkBg: '#3a4030', darkInk: '#d6e4bb' },
  { bg: '#dfe3f7', ink: '#2c3a73', dot: '#97a4e0', darkBg: '#363a4a', darkInk: '#cfd6f5' },
]

/** A student without a level yet. */
export const NO_LEVEL_COLOR: SeatColor = { bg: '#f4f4f5', ink: '#3f3f46', dot: '#a1a1aa', darkBg: '#2a2a2d', darkInk: '#d4d4d8' }

export function levelColor(level: string | null | undefined, levels: readonly string[] = []): SeatColor {
  if (!level) return NO_LEVEL_COLOR
  const known = LEVEL_COLORS[level]
  if (known) return known
  const i = levels.indexOf(level)
  return MORE[(i < 0 ? level.length : i) % MORE.length]
}

/** The sheets' label colours: make-ups red, extra practice light blue, trials and evaluations green. */
export const KIND_COLORS: Readonly<Record<Exclude<SeatKind, 'regular'>, SeatColor & { name: string }>> = {
  makeup: { name: 'Make-up', bg: '#fde8e8', ink: '#b42318', dot: '#f19999', darkBg: '#3b2626', darkInk: '#fca5a5' },
  practice: { name: 'Practice', bg: '#def5f9', ink: '#0e7490', dot: '#7fd3e3', darkBg: '#1f3a3f', darkInk: '#67e8f9' },
  trial: { name: 'Trial', bg: '#e1f5e5', ink: '#1c7c3a', dot: '#86d29b', darkBg: '#22372a', darkInk: '#86efac' },
  evaluation: { name: 'Evaluation', bg: '#e1f5e5', ink: '#1c7c3a', dot: '#86d29b', darkBg: '#22372a', darkInk: '#86efac' },
}
