import type { TrainingPlan, TrainingSession, SessionType } from './types'

export type CoachGuidance = {
  answer: string
  shouldOpenEditor: boolean
  shouldOpenCalendar: boolean
  suggestedDurationMinutes?: number
  suggestedIntensity?: 'easy' | 'moderate' | 'hard' | 'very_hard'
  suggestedSessionType?: SessionType
  shouldShowMetrics?: boolean
  shouldShowToday?: boolean
}

type CoachGuidanceInput = {
  question: string
  plan: TrainingPlan
  session?: TrainingSession
  recentRides?: Array<{ date: number; duration: number }>
}

/**
 * Provides a deterministic, explainable first response for common training questions.
 * Plan changes remain explicit through the existing session editor.
 */
export function buildCoachGuidance({ question, plan, session, recentRides = [] }: CoachGuidanceInput): CoachGuidance | null {
  const normalized = question.trim().toLowerCase()
  if (!normalized) return null

  if (/(tired|fatigue|sore|recover)/.test(normalized)) {
    const explicitlyRequestingRecovery = /(?:make|set|change|turn|switch|convert).*(?:easy|recovery)|(?:easy|recovery).*(?:ride|session|today)/.test(normalized)
    if (explicitlyRequestingRecovery) {
      return {
        answer: 'I suggest making today an easy recovery session. Review the proposed change below and apply it only if it matches how you feel.',
        shouldOpenEditor: false,
        shouldOpenCalendar: false,
        suggestedIntensity: 'easy',
      }
    }
    return {
      answer: 'Yes. Keep the session easy, shorten it if needed, and avoid chasing the planned numbers. Log the result so the next recommendation reflects how you felt.',
      shouldOpenEditor: /(tired|fatigue|sore)/.test(normalized) && Boolean(session),
      shouldOpenCalendar: false,
    }
  }

  if (/(short|less time|busy|only have|\d+\s*(minute|min|hour|hr)s?)/.test(normalized)) {
    const durationMatch = normalized.match(/(\d+)\s*(minute|min|hour|hr)s?/)
    const requestedMinutes = durationMatch
      ? Number(durationMatch[1]) * (/hour|hr/.test(durationMatch[2]) ? 60 : 1)
      : undefined
    const requestedEasyIntensity = /(easier|easy|reduce intensity|less intense|recovery)/.test(normalized)
    return {
      answer: requestedMinutes
        ? `I can suggest ${requestedMinutes} minutes while keeping the main training intent. Review the proposed change below and apply it if it feels right.`
        : 'Use the warm-up, one focused block, and a short cool-down. Review the proposed change below and apply it if it feels right.',
      shouldOpenEditor: Boolean(session) && !requestedMinutes,
      shouldOpenCalendar: false,
      suggestedDurationMinutes: requestedMinutes,
      suggestedIntensity: requestedEasyIntensity ? 'easy' : undefined,
    }
  }

  if (/(move|skip|swap|reschedule|another day)/.test(normalized)) {
    return {
      answer: 'That is reasonable to discuss. Open the calendar to choose a replacement day or an easier session, then save the change so it remains visible in your plan and sync history.',
      shouldOpenEditor: false,
      shouldOpenCalendar: true,
    }
  }

  if (/(good session|best session|what should i do|recommend.*workout|suggest.*workout)/.test(normalized)) {
    const recentHours = recentRides.reduce((sum, ride) => sum + (ride.duration > 600 ? ride.duration / 3600 : ride.duration / 60), 0)
    const recommendation = plan.goal === 'climbing_sustainability'
      ? 'a controlled threshold session with steady seated climbing intervals'
      : plan.goal === 'endurance'
        ? 'an easy endurance ride with smooth, even pacing'
        : plan.goal === 'recovery'
          ? 'a short recovery spin or complete rest'
          : 'a focused threshold session with enough recovery between blocks'
    return {
      answer: `Based on your ${plan.goal.replace(/_/g, ' ')} goal, I would choose ${recommendation}. Your recent synced volume is ${recentHours.toFixed(1)} hours; keep the session sustainable rather than adding intensity just to do more.`,
      shouldOpenEditor: false,
      shouldOpenCalendar: false,
      shouldShowToday: true,
    }
  }

  if (/(metric|progress|chart|graph|trend|fitness|load|volume|data)/.test(normalized)) {
    return {
      answer: 'Here is your recent training snapshot. I kept the detailed graph available without making it part of every daily decision.',
      shouldOpenEditor: false,
      shouldOpenCalendar: false,
      shouldShowMetrics: true,
    }
  }

  if (/(tomorrow|next workout|next session)/.test(normalized)) {
    return {
      answer: 'The best next step is to complete today at the right intensity, then review the next session in Calendar. Your readiness check-in will help guide that decision.',
      shouldOpenEditor: false,
      shouldOpenCalendar: false,
    }
  }

  if (/(why|purpose|benefit|focus)/.test(normalized)) {
    return {
      answer: session
        ? `${session.type} supports your ${plan.goal.replace(/_/g, ' ')} goal. Focus on ${session.focus?.[0] || 'smooth, controlled execution'} rather than adding extra intensity.`
        : 'Today is a recovery opportunity. The goal is to absorb recent training and arrive fresher for the next quality session.',
      shouldOpenEditor: false,
      shouldOpenCalendar: false,
    }
  }

  if (/(easier|easy|reduce intensity|less intense|recovery)/.test(normalized)) {
    return {
      answer: 'I suggest reducing today to an easy effort. Review the proposed change below and apply it only if it matches how you feel.',
      shouldOpenEditor: false,
      shouldOpenCalendar: false,
      suggestedIntensity: 'easy',
    }
  }

  const requestedSessionType = normalized.match(/(?:make|set|change|turn|switch).*(?:today|this|the)?\s*(endurance|tempo|threshold|vo2|max|anaerobic|strength|recovery)/)?.[1]
  if (requestedSessionType) {
    const sessionType: SessionType = requestedSessionType === 'max' || requestedSessionType === 'vo2' ? 'vo2max' : requestedSessionType as SessionType
    return {
      answer: `I can change today to a ${sessionType === 'vo2max' ? 'VO2 max' : sessionType} session. Review the proposed workout change below before syncing it.`,
      shouldOpenEditor: false,
      shouldOpenCalendar: false,
      suggestedSessionType: sessionType,
    }
  }

  if (/(make|set|increase|raise|go).*(harder|hard|more intense|very hard)|(?:harder|more intense).*(?:today|session|ride)/.test(normalized)) {
    const suggestedIntensity = /very hard/.test(normalized) ? 'very_hard' : /harder|more intense/.test(normalized) ? 'hard' : 'hard'
    return {
      answer: `I can propose a ${suggestedIntensity.replace('_', ' ')} effort, but only increase it if your readiness and warm-up support the change. Review the proposed change below before syncing it.`,
      shouldOpenEditor: false,
      shouldOpenCalendar: false,
      suggestedIntensity,
    }
  }

  if (/(how hard|intensity|pace|zone|effort)/.test(normalized)) {
    return {
      answer: session
        ? `${session.type} is planned as a ${(session.intensity || 'controlled').replace('_', ' ')} effort. Use the prescribed power or heart-rate range, and let breathing and control confirm the pace rather than forcing the number.`
        : 'Keep today easy and conversational. If breathing is strained or your legs feel heavy, reduce the effort and prioritize recovery.',
      shouldOpenEditor: false,
      shouldOpenCalendar: false,
    }
  }

  if (/(today|workout|session|readiness|plan|what.*do|recommend)/.test(normalized)) {
    return {
      answer: 'Here is the training context for today. Ask me to change the session, shorten it, move it, or explain its purpose.',
      shouldOpenEditor: false,
      shouldOpenCalendar: false,
      shouldShowToday: true,
    }
  }

  return {
    answer: 'I can help with pacing, fatigue, time available, or the purpose of today’s session. Try asking “Can I go easier?” or “I only have 45 minutes.”',
    shouldOpenEditor: false,
    shouldOpenCalendar: false,
  }
}
