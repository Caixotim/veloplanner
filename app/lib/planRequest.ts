const WEEKDAYS = {
  en: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
  pt: ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'],
}

export function parsePlanStartDate(text: string, today = new Date()): string {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const isoDate = normalized.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1]
  if (isoDate) return isoDate

  const europeanDate = normalized.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/)
  if (europeanDate) return `${europeanDate[3]}-${europeanDate[2].padStart(2, '0')}-${europeanDate[1].padStart(2, '0')}`

  const monthDate = normalized.match(/\b(?:on|from|starting|start(?:ing)?|a partir de|comec(?:ar|ando)?(?: no)?|dia)?\s*(\d{1,2})\s*(?:of\s*)?(january|february|march|april|may|june|july|august|september|october|november|december|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(20\d{2})?\b/)
  if (monthDate) {
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
    const monthNames = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
    const month = months.indexOf(monthDate[2]) >= 0 ? months.indexOf(monthDate[2]) : monthNames.indexOf(monthDate[2])
    const year = Number(monthDate[3] || today.getFullYear())
    const candidate = new Date(year, month, Number(monthDate[1]))
    if (!monthDate[3] && candidate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) candidate.setFullYear(year + 1)
    return formatDate(candidate)
  }

  const weekday = WEEKDAYS.en.concat(WEEKDAYS.pt).findIndex((day) => new RegExp(`\\b${day}(?:-feira)?\\b`).test(normalized))
  if (weekday >= 0) {
    const targetDay = weekday % 7
    const result = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const daysAhead = (targetDay - result.getDay() + 7) % 7 || 7
    const explicitlyNext = /\bnext\b|\bproxima(?:s)?\b/.test(normalized)
    if (explicitlyNext && targetDay > result.getDay()) result.setDate(result.getDate() + 7)
    result.setDate(result.getDate() + daysAhead)
    return formatDate(result)
  }

  const nextMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7))
  return formatDate(nextMonday)
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
