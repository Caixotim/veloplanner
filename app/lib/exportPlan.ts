/**
 * Training plan exports
 */

import JSZip from 'jszip'
import type { TrainingPlan } from './types'

/**
 * Open the plan in a new tab with all app stylesheets, ready to print or save as PDF.
 * The user can use the browser's native Cmd+P / Ctrl+P to print or choose "Save as PDF".
 */
export function openPlanForPrint(
  elementId: string
): void {
  const element = document.getElementById(elementId)
  if (!element) {
    throw new Error('Element not found for print')
  }

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    throw new Error('Could not open print window — check popup blocker')
  }

  // Copy all <link rel="stylesheet"> and <style> tags so CSS Module classes resolve correctly
  const styleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((el) => el.outerHTML)
    .join('\n')
  const inlineStyles = Array.from(document.querySelectorAll('style'))
    .map((el) => el.outerHTML)
    .join('\n')

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Training Plan</title>
  ${styleLinks}
  ${inlineStyles}
  <style>
    body { margin: 0; padding: 1.5rem; background: white; }
    button, [role="button"], nav, header { display: none !important; }
  </style>
</head>
<body>
  ${element.outerHTML}
</body>
</html>`)
  printWindow.document.close()

  // Trigger print once stylesheets have loaded
  printWindow.addEventListener('load', () => {
    printWindow.focus()
    printWindow.print()
  })
}


/**
 * Export plan to CSV format
 */
export function exportPlanToCSV(plan: TrainingPlan): string {
  let csv = 'Training Plan Export\n'
  csv += `Plan ID,${plan.id}\n`
  csv += `Duration,${plan.durationWeeks} weeks\n`
  csv += `Goal,${plan.goal}\n`
  csv += `Start Date,${plan.startDate.toISOString()}\n\n`

  csv += 'Week,Phase,Total Hours,Focus Points,Sessions\n'

  for (const week of plan.weeks) {
    const focusString = week.focusPoints.join('; ')
    const sessionCount = week.sessions.length

    csv += `${week.weekNumber},${week.phase},${week.totalHours.toFixed(1)},${focusString},${sessionCount}\n`

    for (const session of week.sessions) {
      const details = session.structuredWorkout?.join(' | ') || session.notes || ''
      csv += `,,,"${session.type}",${session.duration}min - ${session.description} - ${details}\n`
    }
  }

  return csv
}

/**
 * Download CSV file
 */
export function downloadCSV(csv: string, fileName = 'cycling-plan.csv'): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', fileName)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Export plan to iCalendar format (importable to Google Calendar)
 */
export function exportPlanToICS(plan: TrainingPlan): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CyclingAI//Training Plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]

  for (const week of plan.weeks) {
    for (const session of week.sessions) {
      const start = new Date(session.date)
      start.setHours(6, 0, 0, 0)
      const end = new Date(start.getTime() + session.duration * 60 * 1000)
      const nowUtc = toICSDateTime(new Date())
      const descriptionLines = [
        session.description,
        ...(session.structuredWorkout || []),
        session.notes || '',
      ].filter(Boolean)

      lines.push('BEGIN:VEVENT')
      lines.push(`UID:${session.id}@cyclingai`)
      lines.push(`DTSTAMP:${nowUtc}`)
      lines.push(`DTSTART:${toICSDateTime(start)}`)
      lines.push(`DTEND:${toICSDateTime(end)}`)
      lines.push(`SUMMARY:${escapeICSText(`[W${week.weekNumber}] ${session.type.toUpperCase()} - ${session.duration}min`)}`)
      lines.push(`DESCRIPTION:${escapeICSText(descriptionLines.join('\\n'))}`)
      lines.push(`LOCATION:${escapeICSText('Bike Trainer / Road')}`)
      lines.push('END:VEVENT')
    }
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

/**
 * Download iCalendar file
 */
export function downloadICS(ics: string, fileName = 'cycling-training-plan.ics'): void {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', fileName)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

type DownloadableWorkoutFile = {
  fileName: string
  content: string
  mimeType: string
}

/**
 * Build a Garmin-friendly interval text guide from all sessions.
 */
export function exportPlanToGarminIntervalText(plan: TrainingPlan): string {
  const lines: string[] = []

  lines.push('CyclingAI Garmin Interval Guide')
  lines.push(`Plan: ${plan.id}`)
  lines.push(`Goal: ${plan.goal}`)
  lines.push(`Duration: ${plan.durationWeeks} weeks`)
  lines.push('')

  for (const week of plan.weeks) {
    lines.push(`Week ${week.weekNumber} (${week.phase})`)
    lines.push(`Focus: ${week.focusPoints.join(', ')}`)

    for (const session of week.sessions) {
      lines.push(`  - Day ${session.dayOfWeek}: ${session.type.toUpperCase()} (${session.duration}min)`)

      const steps = session.structuredWorkout?.length
        ? session.structuredWorkout
        : buildFallbackStructuredSteps(session.type, session.duration)

      for (const step of steps) {
        lines.push(`    * ${step}`)
      }
    }

    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Build per-session Zwift workout files (.zwo) from the current plan.
 */
export function exportPlanToZwiftWorkouts(plan: TrainingPlan): DownloadableWorkoutFile[] {
  const files: DownloadableWorkoutFile[] = []

  for (const week of plan.weeks) {
    for (const session of week.sessions) {
      const workoutName = `W${week.weekNumber}-D${session.dayOfWeek}-${session.type}-${session.duration}min`
      const safeName = workoutName.toLowerCase().replace(/[^a-z0-9-]+/g, '-')

      files.push({
        fileName: `${safeName}.zwo`,
        content: buildZwiftWorkoutXml(plan, week.weekNumber, session),
        mimeType: 'application/xml;charset=utf-8;',
      })
    }
  }

  return files
}

/**
 * Build a single zip bundle with Garmin interval text + all Zwift workout files.
 */
export async function exportPlanWorkoutBundleZip(plan: TrainingPlan): Promise<Blob> {
  const zip = new JSZip()
  const intervalGuide = exportPlanToGarminIntervalText(plan)
  const workouts = exportPlanToZwiftWorkouts(plan)

  zip.file('garmin/cycling-training-plan-garmin-intervals.txt', intervalGuide)

  for (const workout of workouts) {
    zip.file(`zwift/${workout.fileName}`, workout.content)
  }

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  })
}

/**
 * Generic browser file download helper.
 */
export function downloadFile(content: string, fileName: string, mimeType = 'text/plain;charset=utf-8;'): void {
  const blob = new Blob([content], { type: mimeType })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', fileName)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function toICSDateTime(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`
}

function escapeICSText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function buildZwiftWorkoutXml(plan: TrainingPlan, weekNumber: number, session: TrainingPlan['weeks'][number]['sessions'][number]): string {
  const blocks = buildZwiftBlocks(session.type, session.duration)
  const workoutLines = blocks.map((block) => {
    if (block.kind === 'warmup') {
      return `      <Warmup Duration="${block.durationSec}" PowerLow="${block.powerLow}" PowerHigh="${block.powerHigh}"/>`
    }

    if (block.kind === 'cooldown') {
      return `      <Cooldown Duration="${block.durationSec}" PowerLow="${block.powerLow}" PowerHigh="${block.powerHigh}"/>`
    }

    if (block.kind === 'steady') {
      return `      <SteadyState Duration="${block.durationSec}" Power="${block.power}"/>`
    }

    return `      <IntervalsT Repeat="${block.repeat}" OnDuration="${block.onDurationSec}" OffDuration="${block.offDurationSec}" OnPower="${block.onPower}" OffPower="${block.offPower}"/>`
  })

  const descriptionSteps = session.structuredWorkout?.length
    ? session.structuredWorkout
    : buildFallbackStructuredSteps(session.type, session.duration)

  return [
    '<workout_file>',
    '  <author>CyclingAI</author>',
    `  <name>W${weekNumber} ${session.type.toUpperCase()} ${session.duration}min</name>`,
    `  <description>${escapeXml(descriptionSteps.join(' | '))}</description>`,
    '  <tags>',
    `    <tag name="goal" value="${plan.goal}"/>`,
    `    <tag name="week" value="${weekNumber}"/>`,
    `    <tag name="session_type" value="${session.type}"/>`,
    '  </tags>',
    '  <workout>',
    ...workoutLines,
    '  </workout>',
    '</workout_file>',
  ].join('\n')
}

function buildZwiftBlocks(type: TrainingPlan['weeks'][number]['sessions'][number]['type'], durationMin: number) {
  const totalSec = Math.max(20 * 60, durationMin * 60)
  const warmupSec = Math.min(10 * 60, Math.floor(totalSec * 0.2))
  const cooldownSec = Math.min(10 * 60, Math.floor(totalSec * 0.2))
  const mainSec = Math.max(5 * 60, totalSec - warmupSec - cooldownSec)

  if (type === 'vo2max') {
    const repeat = Math.max(3, Math.floor(mainSec / (3 * 60 + 3 * 60)))
    return [
      { kind: 'warmup' as const, durationSec: warmupSec, powerLow: 0.5, powerHigh: 0.7 },
      {
        kind: 'intervals' as const,
        repeat,
        onDurationSec: 3 * 60,
        offDurationSec: 3 * 60,
        onPower: 1.15,
        offPower: 0.55,
      },
      { kind: 'cooldown' as const, durationSec: cooldownSec, powerLow: 0.6, powerHigh: 0.45 },
    ]
  }

  if (type === 'threshold') {
    const repeat = Math.max(2, Math.floor(mainSec / (8 * 60 + 4 * 60)))
    return [
      { kind: 'warmup' as const, durationSec: warmupSec, powerLow: 0.5, powerHigh: 0.72 },
      {
        kind: 'intervals' as const,
        repeat,
        onDurationSec: 8 * 60,
        offDurationSec: 4 * 60,
        onPower: 0.97,
        offPower: 0.58,
      },
      { kind: 'cooldown' as const, durationSec: cooldownSec, powerLow: 0.6, powerHigh: 0.45 },
    ]
  }

  if (type === 'anaerobic') {
    const repeat = Math.max(6, Math.floor(mainSec / (60 + 2 * 60)))
    return [
      { kind: 'warmup' as const, durationSec: warmupSec, powerLow: 0.5, powerHigh: 0.72 },
      {
        kind: 'intervals' as const,
        repeat,
        onDurationSec: 60,
        offDurationSec: 2 * 60,
        onPower: 1.35,
        offPower: 0.52,
      },
      { kind: 'cooldown' as const, durationSec: cooldownSec, powerLow: 0.6, powerHigh: 0.45 },
    ]
  }

  if (type === 'tempo') {
    return [
      { kind: 'warmup' as const, durationSec: warmupSec, powerLow: 0.5, powerHigh: 0.68 },
      { kind: 'steady' as const, durationSec: mainSec, power: 0.82 },
      { kind: 'cooldown' as const, durationSec: cooldownSec, powerLow: 0.6, powerHigh: 0.45 },
    ]
  }

  if (type === 'recovery') {
    return [
      { kind: 'warmup' as const, durationSec: warmupSec, powerLow: 0.45, powerHigh: 0.55 },
      { kind: 'steady' as const, durationSec: mainSec, power: 0.5 },
      { kind: 'cooldown' as const, durationSec: cooldownSec, powerLow: 0.5, powerHigh: 0.4 },
    ]
  }

  return [
    { kind: 'warmup' as const, durationSec: warmupSec, powerLow: 0.5, powerHigh: 0.68 },
    { kind: 'steady' as const, durationSec: mainSec, power: 0.68 },
    { kind: 'cooldown' as const, durationSec: cooldownSec, powerLow: 0.6, powerHigh: 0.45 },
  ]
}

function buildFallbackStructuredSteps(type: TrainingPlan['weeks'][number]['sessions'][number]['type'], durationMin: number): string[] {
  const total = Math.max(20, durationMin)
  const warmup = Math.min(10, Math.round(total * 0.2))
  const cooldown = Math.min(10, Math.round(total * 0.2))
  const main = Math.max(5, total - warmup - cooldown)

  if (type === 'vo2max') {
    return [
      `Warm up ${warmup}min at 55-70% FTP`,
      `Main set ${Math.max(3, Math.floor(main / 6))}x (3min at 110-120% FTP / 3min at 50-60% FTP)`,
      `Cool down ${cooldown}min easy spin`,
    ]
  }

  if (type === 'threshold') {
    return [
      `Warm up ${warmup}min at 55-72% FTP`,
      `Main set ${Math.max(2, Math.floor(main / 12))}x (8min at 95-100% FTP / 4min at 55-60% FTP)`,
      `Cool down ${cooldown}min easy spin`,
    ]
  }

  if (type === 'anaerobic') {
    return [
      `Warm up ${warmup}min progressive spin`,
      `Main set ${Math.max(6, Math.floor(main / 3))}x (1min at 125-140% FTP / 2min at 50-55% FTP)`,
      `Cool down ${cooldown}min easy spin`,
    ]
  }

  if (type === 'tempo') {
    return [
      `Warm up ${warmup}min easy`,
      `${main}min at 76-88% FTP`,
      `Cool down ${cooldown}min easy`,
    ]
  }

  if (type === 'recovery') {
    return [`${total}min at 45-55% FTP, smooth cadence, keep it easy`]
  }

  return [
    `Warm up ${warmup}min at 55-68% FTP`,
    `${main}min endurance at 60-72% FTP`,
    `Cool down ${cooldown}min easy`,
  ]
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}


