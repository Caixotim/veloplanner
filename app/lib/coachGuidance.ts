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
  shouldShowNutrition?: boolean
  shouldDeleteSession?: boolean
  shouldDeleteFutureSessions?: boolean
}

type CoachGuidanceInput = {
  question: string
  plan: TrainingPlan
  session?: TrainingSession
  recentRides?: Array<{ date: number; duration: number }>
  locale?: 'en' | 'pt-PT'
}

/**
 * Provides a deterministic, explainable first response for common training questions.
 * Plan changes remain explicit through the existing session editor.
 */
export function buildCoachGuidance({ question, plan, session, recentRides = [], locale = 'en' }: CoachGuidanceInput): CoachGuidance | null {
  const pt = locale === 'pt-PT'
  const normalized = question.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!normalized) return null

  if (/(delete|remove|cancel|remov|elimin|apag).*(session|workout|ride|sess(?:ion|oes?)|treino|volta)|(?:(session|workout|ride|sess(?:ion|oes?)|treino|volta).*(delete|remove|cancel|remov|elimin|apag))/.test(normalized)) {
    const asksAboutFuture = /(future|upcoming|remaining|rest of|after today|from tomorrow|next week|later this week|futur[oa]s?|proxim[ao]s?|restantes?|depois de hoje|a partir de amanha)/.test(normalized)
    const hasSpecificTarget = /(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|segunda|terca|quarta|quinta|sexta|sabado|domingo|20\d{2}-\d{2}-\d{2}|threshold|tempo|endurance|vo2|strength|recovery|anaerobic)/.test(normalized)
    const asksForMultiple = /\b(sessions|workouts|rides|sessoes|treinos|voltas|all|every|todas?|todos?)\b/.test(normalized)
    const isPortugueseDeletion = /\b(remov|elimin|apag|cancel).*(sess|trein|volt)|\b(sess|trein|volt).*(remov|elimin|apag|cancel)/.test(normalized)
    if (asksAboutFuture && !hasSpecificTarget && isPortugueseDeletion) {
      return {
        answer: pt ? 'Encontrei as sessões futuras no seu calendário. Vou mostrar exactamente o que será removido e pedir-lhe confirmação antes de alterar o plano.' : 'I found the future sessions in your calendar. I will show exactly what will be removed and ask you to confirm before changing your plan.',
        shouldOpenEditor: false,
        shouldOpenCalendar: false,
        shouldDeleteFutureSessions: true,
      }
    }
    if ((asksAboutFuture || asksForMultiple) && !hasSpecificTarget) {
      return {
        answer: pt ? 'Posso ajudar a remover sessões futuras, mas preciso primeiro do limite: devo remover tudo depois de hoje ou apenas uma semana ou intervalo de datas específico? Mostrarei exactamente o que será removido e pedirei confirmação.' : 'I can help clear upcoming sessions, but I need to know the boundary first: should I remove everything after today, or only sessions in a specific week or date range? I will show you exactly what will be removed and ask you to confirm before changing anything.',
        shouldOpenEditor: false,
        shouldOpenCalendar: false,
      }
    }

    return {
      answer: pt ? 'Encontrei a sessão correspondente no seu calendário. Vou mostrar os detalhes e pedir confirmação antes de alterar o plano ou o Intervals.icu.' : 'I found the matching session in your calendar. I’ll show you the details and ask for confirmation before changing your plan or Intervals.icu.',
      shouldOpenEditor: false,
      shouldOpenCalendar: false,
      shouldDeleteSession: Boolean(session),
    }
  }

  if (/(create|add|schedule|plan|book).*(session|workout|ride)|(?:session|workout|ride).*(create|add|schedule|book)/.test(normalized)) {
    const requestedSessionType = normalized.includes('strength')
      ? 'strength'
      : normalized.includes('tempo')
        ? 'tempo'
        : normalized.includes('threshold')
          ? 'threshold'
          : normalized.includes('vo2')
            ? 'vo2max'
            : normalized.includes('recovery')
              ? 'recovery'
              : 'endurance'
    const durationMatch = normalized.match(/(\d+)\s*(minute|min|hour|hr)s?/)
    const suggestedDurationMinutes = durationMatch
      ? Number(durationMatch[1]) * (/hour|hr/.test(durationMatch[2]) ? 60 : 1)
      : requestedSessionType === 'strength' ? 45 : 60
    return {
      answer: pt ? 'Posso preparar essa sessão. Reveja os detalhes abaixo e confirme antes de a adicionar ao seu plano.' : 'I can prepare that session. Review the workout details below and confirm before I add it to your plan.',
      shouldOpenEditor: false,
      shouldOpenCalendar: false,
      suggestedSessionType: requestedSessionType,
      suggestedDurationMinutes,
      suggestedIntensity: requestedSessionType === 'recovery' || requestedSessionType === 'endurance' ? 'easy' : 'moderate',
    }
  }

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

  if (/(nutrition|meal|fuel|eat|carb|protein)/.test(normalized)) {
    return {
      answer: 'Here are today’s nutrition suggestions. Ask me for pre-ride fuel, recovery food, or a full meal plan if you want something more specific.',
      shouldOpenEditor: false,
      shouldOpenCalendar: false,
      shouldShowNutrition: true,
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
