import type { SessionType } from './types'

type WorkoutStep = {
  minutes: number
  target: string
  note: string
}

type WorkoutTemplate = {
  id: string
  name: string
  sessionType: SessionType
  steps: WorkoutStep[]
}

export const WORKOUT_TEMPLATES: WorkoutTemplate[] = [
  // Threshold templates
  {
    id: 'thr_cruise_3x10',
    name: '3 × 10 Threshold Cruise',
    sessionType: 'threshold',
    steps: [
      { minutes: 12, target: '55-65% FTP', note: 'Warm-up' },
      { minutes: 10, target: '95-100% FTP', note: 'Set 1' },
      { minutes: 3, target: '50-60% FTP', note: 'Recovery' },
      { minutes: 10, target: '95-100% FTP', note: 'Set 2' },
      { minutes: 3, target: '50-60% FTP', note: 'Recovery' },
      { minutes: 10, target: '95-100% FTP', note: 'Set 3' },
      { minutes: 8, target: '50-60% FTP', note: 'Cool-down' },
    ],
  },
  {
    id: 'thr_sweetspot_2x20',
    name: '2 × 20 Sweet Spot',
    sessionType: 'threshold',
    steps: [
      { minutes: 12, target: '55-65% FTP', note: 'Warm-up' },
      { minutes: 20, target: '88-94% FTP', note: 'Set 1 — steady sweet spot' },
      { minutes: 5, target: '55-60% FTP', note: 'Recovery' },
      { minutes: 20, target: '88-94% FTP', note: 'Set 2 — steady sweet spot' },
      { minutes: 8, target: '50-55% FTP', note: 'Cool-down' },
    ],
  },
  {
    id: 'thr_over_under_4x8',
    name: '4 × 8 Over-Unders',
    sessionType: 'threshold',
    steps: [
      { minutes: 12, target: '55-65% FTP', note: 'Warm-up + 3x30s openers' },
      { minutes: 8, target: 'Alt 2min 90-95% / 2min 105-108% FTP', note: 'Set 1 — over-under' },
      { minutes: 3, target: '55-60% FTP', note: 'Recovery' },
      { minutes: 8, target: 'Alt 2min 90-95% / 2min 105-108% FTP', note: 'Set 2 — over-under' },
      { minutes: 3, target: '55-60% FTP', note: 'Recovery' },
      { minutes: 8, target: 'Alt 2min 90-95% / 2min 105-108% FTP', note: 'Set 3 — over-under' },
      { minutes: 3, target: '55-60% FTP', note: 'Recovery' },
      { minutes: 8, target: 'Alt 2min 90-95% / 2min 105-108% FTP', note: 'Set 4 — over-under' },
      { minutes: 8, target: '50-55% FTP', note: 'Cool-down' },
    ],
  },
  // VO2max templates
  {
    id: 'vo2_5x4',
    name: '5 × 4 min VO2 Repeats',
    sessionType: 'vo2max',
    steps: [
      { minutes: 12, target: '55-65% FTP', note: 'Warm-up + 3x1min builds' },
      { minutes: 4, target: '110-120% FTP', note: 'Rep 1' },
      { minutes: 4, target: '55-60% FTP', note: 'Recovery' },
      { minutes: 4, target: '110-120% FTP', note: 'Rep 2' },
      { minutes: 4, target: '55-60% FTP', note: 'Recovery' },
      { minutes: 4, target: '110-120% FTP', note: 'Rep 3' },
      { minutes: 4, target: '55-60% FTP', note: 'Recovery' },
      { minutes: 4, target: '110-120% FTP', note: 'Rep 4' },
      { minutes: 4, target: '55-60% FTP', note: 'Recovery' },
      { minutes: 4, target: '110-120% FTP', note: 'Rep 5' },
      { minutes: 8, target: '50-55% FTP', note: 'Cool-down' },
    ],
  },
  {
    id: 'vo2_micro_30_15',
    name: '30/15 Micro Intervals (4 sets)',
    sessionType: 'vo2max',
    steps: [
      { minutes: 12, target: '55-65% FTP', note: 'Warm-up + 2x1min builds' },
      { minutes: 7, target: '30s at 120-130% FTP / 15s at 60-70% FTP (repeat)', note: 'Set 1 — 30/15' },
      { minutes: 5, target: '55-60% FTP', note: 'Set recovery' },
      { minutes: 7, target: '30s at 120-130% FTP / 15s at 60-70% FTP (repeat)', note: 'Set 2 — 30/15' },
      { minutes: 5, target: '55-60% FTP', note: 'Set recovery' },
      { minutes: 7, target: '30s at 120-130% FTP / 15s at 60-70% FTP (repeat)', note: 'Set 3 — 30/15' },
      { minutes: 5, target: '55-60% FTP', note: 'Set recovery' },
      { minutes: 7, target: '30s at 120-130% FTP / 15s at 60-70% FTP (repeat)', note: 'Set 4 — 30/15' },
      { minutes: 8, target: '50-55% FTP', note: 'Cool-down' },
    ],
  },
  // Tempo
  {
    id: 'tempo_3x12',
    name: '3 × 12 Tempo Blocks',
    sessionType: 'tempo',
    steps: [
      { minutes: 10, target: '55-65% FTP', note: 'Warm-up' },
      { minutes: 12, target: '80-88% FTP', note: 'Tempo block 1' },
      { minutes: 5, target: '55-60% FTP', note: 'Active recovery' },
      { minutes: 12, target: '80-88% FTP', note: 'Tempo block 2' },
      { minutes: 5, target: '55-60% FTP', note: 'Active recovery' },
      { minutes: 12, target: '80-88% FTP', note: 'Tempo block 3' },
      { minutes: 8, target: '50-55% FTP', note: 'Cool-down' },
    ],
  },
  // Endurance
  {
    id: 'endurance_z2_90',
    name: 'Z2 Aerobic Base 90 min',
    sessionType: 'endurance',
    steps: [
      { minutes: 10, target: '55-65% FTP', note: 'Easy warm-up' },
      { minutes: 70, target: '62-75% FTP', note: 'Steady Z2 — conversational pace' },
      { minutes: 10, target: '50-55% FTP', note: 'Cool-down' },
    ],
  },
  {
    id: 'endurance_z2_surges',
    name: 'Z2 with 5 × 1min Surges',
    sessionType: 'endurance',
    steps: [
      { minutes: 12, target: '55-65% FTP', note: 'Easy warm-up' },
      { minutes: 20, target: '62-75% FTP', note: 'Z2 block 1' },
      { minutes: 1, target: '105-115% FTP', note: 'Surge 1' },
      { minutes: 20, target: '62-75% FTP', note: 'Z2 block 2' },
      { minutes: 1, target: '105-115% FTP', note: 'Surge 2' },
      { minutes: 15, target: '62-75% FTP', note: 'Z2 block 3' },
      { minutes: 1, target: '105-115% FTP', note: 'Surge 3' },
      { minutes: 10, target: '55-60% FTP', note: 'Cool-down' },
    ],
  },
  // Anaerobic
  {
    id: 'anaerobic_sprints_10x15',
    name: '10 × 15s Sprints',
    sessionType: 'anaerobic',
    steps: [
      { minutes: 15, target: '55-65% FTP', note: 'Warm-up + 4x8s openers' },
      { minutes: 1, target: 'Max sprint — seated', note: 'Sprint 1–5 × 15s / 2:45 recovery each' },
      { minutes: 1, target: 'Max sprint — standing', note: 'Sprint 6–10 × 15s / 2:45 recovery each' },
      { minutes: 10, target: '50-55% FTP', note: 'Cool-down' },
    ],
  },
  // Recovery
  {
    id: 'recovery_easy_spin',
    name: 'Easy Recovery Spin 45 min',
    sessionType: 'recovery',
    steps: [
      { minutes: 45, target: '45-55% FTP', note: 'Easy spin — high cadence (90-100 rpm), no pressure' },
    ],
  },
]

export function getTemplatesForType(sessionType: SessionType): WorkoutTemplate[] {
  return WORKOUT_TEMPLATES.filter((template) => template.sessionType === sessionType)
}
