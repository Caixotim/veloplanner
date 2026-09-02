'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SessionCompletion, TrainingPlan, TrainingSession, UserProfile } from '../lib/types'
import { buildCoachGuidance } from '../lib/coachGuidance'
import { useLocale } from '../lib/i18n'
import { parsePlanStartDate } from '../lib/planRequest'
import styles from './CoachToday.module.scss'

type CoachTodayProps = {
  plan: TrainingPlan
  userProfile?: Partial<UserProfile>
  onOpenCalendar: () => void
  onShowNutrition: () => void
  onEditSession: (weekNumber: number, dayOfWeek: number, session: TrainingSession) => void
  onApplyCoachChange: (weekNumber: number, dayOfWeek: number, session: TrainingSession) => Promise<void>
  onDeleteCoachSession: (weekNumber: number, dayOfWeek: number) => Promise<void>
  onDeleteFutureCoachSessions: () => Promise<void>
  onCreatePlan?: (profile: Partial<UserProfile>) => Promise<void>
  recentRides?: Array<{ date: number; duration: number }>
  completions?: Map<string, SessionCompletion>
}

type CoachMessage = {
  id: number
  role: 'athlete' | 'coach'
  text: string
}

function renderInlineMarkdown(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
    return <span key={index}>{part}</span>
  })
}

function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter(Boolean)
  return <div className={styles.richText}>
    {blocks.map((block, blockIndex) => {
      const normalizedBlock = block.replace(/\s+(?=\d+[.)]\s)/g, '\n').replace(/\s+(?=[-•]\s)/g, '\n')
      const lines = normalizedBlock.split('\n').filter((line) => line.trim())
      const isBulleted = lines.every((line) => /^[-•]\s+/.test(line))
      const isNumbered = lines.every((line) => /^\d+[.)]\s+/.test(line))
      if (isBulleted || isNumbered) {
        const List = isBulleted ? 'ul' : 'ol'
        return <List key={blockIndex}>{lines.map((line, index) => (
          <li key={index}>{renderInlineMarkdown(line.replace(isBulleted ? /^[-•]\s+/ : /^\d+[.)]\s+/, ''))}</li>
        ))}</List>
      }
      return <p key={blockIndex}>{lines.map((line, index) => {
        const heading = line.match(/^#{1,3}\s+(.+)/)
        return <span key={index}>{heading ? <strong>{renderInlineMarkdown(heading[1])}</strong> : renderInlineMarkdown(line)}{index < lines.length - 1 && <br />}</span>
      })}</p>
    })}
  </div>
}

function conversationalText(value: string, fallback: string): string {
  const text = value.trim()
  if (!text || /^[{[]/.test(text) || /[}\]]$/.test(text) && /[":]/.test(text)) return fallback
  return text
}

function dateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function findRequestedSession(question: string, plan: TrainingPlan): { session: TrainingSession; weekNumber: number; dayOfWeek: number } | undefined {
  const normalized = question.toLowerCase()
  const sessions = plan.weeks.flatMap((week, weekIndex) => week.sessions.map((session) => ({
    session,
    weekNumber: week.weekNumber || weekIndex + 1,
    dayOfWeek: session.dayOfWeek,
  })))
  const weekday = normalized.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)
  const weekdayIndex = weekday ? ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].indexOf(weekday[1]) + 1 : null
  const isoDate = normalized.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1]
  const targetDate = normalized.includes('tomorrow')
    ? new Date(Date.now() + 24 * 60 * 60 * 1000)
    : normalized.includes('today')
      ? new Date()
      : isoDate
        ? new Date(`${isoDate}T00:00:00`)
        : undefined
  const requestedType = ['strength', 'tempo', 'threshold', 'vo2max', 'vo2', 'anaerobic', 'endurance', 'recovery'].find((type) => normalized.includes(type))
  const requestedMinutes = Number(normalized.match(/(\d+)\s*(?:minute|min|hour|hr)s?/)?.[1] || 0) * (/hour|hr/.test(normalized.match(/(\d+)\s*(minute|min|hour|hr)s?/)?.[2] || '') ? 60 : 1)

  return sessions
    .map((candidate) => {
      const candidateDate = new Date(candidate.session.date)
      let score = 0
      if (targetDate && dateKey(candidateDate) === dateKey(targetDate)) score += 8
      if (weekdayIndex && candidate.dayOfWeek === weekdayIndex) score += 7
      if (requestedType && (candidate.session.type === (requestedType === 'vo2' ? 'vo2max' : requestedType))) score += 5
      if (requestedMinutes && candidate.session.duration === requestedMinutes) score += 4
      return { candidate, score }
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)[0]?.candidate
}

export default function CoachToday({
  plan,
  userProfile,
  onOpenCalendar,
  onShowNutrition,
  onEditSession,
  onApplyCoachChange,
  onDeleteCoachSession,
  onDeleteFutureCoachSessions,
  onCreatePlan,
  recentRides = [],
  completions = new Map(),
}: CoachTodayProps) {
  const { isPortuguese, t } = useLocale()
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null)
  const [coachQuestion, setCoachQuestion] = useState('')
  const [conversation, setConversation] = useState<CoachMessage[]>([])
  const [coachLoading, setCoachLoading] = useState(false)
  const [pendingChange, setPendingChange] = useState<{ weekNumber: number; dayOfWeek: number; session: TrainingSession } | null>(null)
  const [pendingDeletion, setPendingDeletion] = useState<{ weekNumber: number; dayOfWeek: number; label: string; date: string } | null>(null)
  const [pendingFutureDeletion, setPendingFutureDeletion] = useState(false)
  const [pendingPlan, setPendingPlan] = useState<Partial<UserProfile> | null>(null)
  const conversationEndRef = useRef<HTMLDivElement>(null)
  const pendingProposalRef = useRef<HTMLElement>(null)

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [conversation, coachLoading])

  useEffect(() => {
    if (pendingFutureDeletion || pendingDeletion || pendingChange || pendingPlan) {
      pendingProposalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [pendingFutureDeletion, pendingDeletion, pendingChange, pendingPlan])
  const todaySessions = useMemo(() => {
    const today = dateKey(new Date())
    return plan.weeks.flatMap((week, weekIndex) =>
      week.sessions
        .filter((session) => dateKey(session.date) === today)
        .map((session) => ({ session, weekNumber: week.weekNumber || weekIndex + 1, dayOfWeek: session.dayOfWeek }))
    )
  }, [plan.weeks])

  const primarySession = todaySessions[0]?.session

  const answerCoachQuestion = async (question: string) => {
    if (coachLoading) return
    setSelectedPrompt(null)
    const normalizedQuestion = question.trim().toLowerCase()
    if (onCreatePlan && /(?:create|build|generate|make|cria(?:r)?|crie|montar|gerar).*(?:plan|plano)|(?:plan|plano).*(?:create|build|generate|make|cria(?:r)?|crie|montar|gerar)/.test(normalizedQuestion)) {
      const goal = /climb|hill|subida|escalada/.test(normalizedQuestion) ? 'climbing_sustainability' : /endurance|resistência|long/.test(normalizedQuestion) ? 'endurance' : /recover|recuperação/.test(normalizedQuestion) ? 'recovery' : 'ftp_increase'
      const weeks = Number(normalizedQuestion.match(/(\d+)\s*(?:weeks?|semanas?)/)?.[1] || 12)
      const start = parsePlanStartDate(normalizedQuestion)
      setPendingPlan({ planName: `${goal.replace(/_/g, ' ')} plan`, goal, desiredPlanWeeks: Math.max(4, Math.min(30, weeks)), planStartDate: start, injuries: [] })
      setConversation((current) => [...current, { id: Date.now(), role: 'athlete', text: question.trim() }, { id: Date.now() + 1, role: 'coach', text: 'I prepared a concise plan proposal from your request. Review it below, then choose Create plan, Adjust, or Dismiss.' }])
      setCoachQuestion('')
      return
    }
    const requestedSession = findRequestedSession(question, plan)
    const guidance = buildCoachGuidance({ question, plan, session: requestedSession?.session || primarySession, recentRides, locale: isPortuguese ? 'pt-PT' : 'en' })
    if (!guidance) return
    if (guidance.shouldDeleteFutureSessions) {
      setPendingFutureDeletion(true)
      setConversation((current) => [...current, { id: Date.now(), role: 'athlete', text: question.trim() }, { id: Date.now() + 1, role: 'coach', text: guidance.answer }])
      setCoachQuestion('')
      return
    }
    if (guidance.shouldShowNutrition) onShowNutrition()
    if (guidance.shouldDeleteSession && (requestedSession || todaySessions[0])) {
      const deletionTarget = requestedSession || todaySessions[0]
      setPendingDeletion({
        weekNumber: deletionTarget.weekNumber,
        dayOfWeek: deletionTarget.dayOfWeek,
        label: deletionTarget.session.type,
        date: new Date(deletionTarget.session.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
      })
    }

    let answer = guidance.answer
    const proposalTarget = requestedSession || todaySessions[0] || plan.weeks.flatMap((week, weekIndex) => week.sessions.map((session) => ({
      session,
      weekNumber: week.weekNumber || weekIndex + 1,
      dayOfWeek: session.dayOfWeek,
    })))[0]
    setCoachLoading(true)
    try {
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          locale: isPortuguese ? 'pt-PT' : 'en',
          context: {
            locale: isPortuguese ? 'pt-PT' : 'en',
            athlete: userProfile ? {
              age: userProfile.age,
              weight: userProfile.weight,
              goal: userProfile.goal,
              ftp: userProfile.ftp,
              availableTime: userProfile.availableTime,
              injuries: userProfile.injuries,
              equipment: userProfile.equipment,
              hasPowerMeter: userProfile.hasPowerMeter,
            } : null,
            goal: plan.goal,
            targetMetrics: plan.targetMetrics,
            session: primarySession
              ? { type: primarySession.type, duration: primarySession.duration, intensity: primarySession.intensity, focus: primarySession.focus }
              : null,
            recentRides: recentRides.slice(-14),
          },
          history: conversation.slice(-8).map((message) => ({ role: message.role === 'athlete' ? 'user' : 'assistant', content: message.text })),
        }),
      })
      if (response.ok) {
        const payload = (await response.json()) as { answer?: string; provider?: 'ollama' | 'openai' }
        const isMutationProposal = Boolean(
          guidance.shouldDeleteSession || guidance.suggestedDurationMinutes || guidance.suggestedIntensity || guidance.suggestedSessionType
        )
        if (payload.answer && !isMutationProposal) {
          answer = conversationalText(payload.answer, guidance.answer)
        }
      }
    } catch {
      // Keep the deterministic answer when local Ollama is unavailable.
    } finally {
      setCoachLoading(false)
    }

          const editorTarget = requestedSession || todaySessions[0]
    if (guidance.shouldOpenEditor && guidance.suggestedDurationMinutes && editorTarget) {
            const suggestedDuration = Math.max(15, Math.min(guidance.suggestedDurationMinutes, editorTarget.session.duration))
      answer = `I suggested ${suggestedDuration} minutes in the editor. Keep the warm-up, one focused block, and a short cool-down, then save only if the adjustment feels right.`
    }

    setConversation((current) => [
      ...current,
      { id: Date.now(), role: 'athlete', text: question.trim() },
      { id: Date.now() + 1, role: 'coach', text: answer },
    ])
    setCoachQuestion('')
    if (guidance.shouldOpenEditor && editorTarget) {
      const suggestedSession = guidance.suggestedDurationMinutes
        ? { ...editorTarget.session, duration: Math.max(15, Math.min(guidance.suggestedDurationMinutes, editorTarget.session.duration)) }
        : editorTarget.session
      onEditSession(editorTarget.weekNumber, editorTarget.dayOfWeek, suggestedSession)
    }
    if ((guidance.suggestedIntensity || guidance.suggestedDurationMinutes) && proposalTarget) {
      const suggestedDuration = guidance.suggestedDurationMinutes
        ? Math.max(15, Math.min(guidance.suggestedDurationMinutes, proposalTarget.session.duration))
        : proposalTarget.session.duration
      setPendingChange({
        weekNumber: proposalTarget.weekNumber,
        dayOfWeek: proposalTarget.dayOfWeek,
        session: {
          ...proposalTarget.session,
          duration: suggestedDuration,
          ...(guidance.suggestedSessionType ? {
            type: guidance.suggestedSessionType,
            description: `Coach-adjusted ${guidance.suggestedSessionType} session`,
          } : {}),
          ...(guidance.suggestedIntensity ? { intensity: guidance.suggestedIntensity } : {}),
        },
      })
    }
    if (guidance.shouldOpenCalendar) {
      onOpenCalendar()
    }
  }

  const schedulePendingPlan = async () => {
    if (!pendingPlan || !onCreatePlan) return
    await onCreatePlan(pendingPlan)
    setPendingPlan(null)
  }

  return (
    <section className={styles.wrapper} aria-label={t('askCoach')}>
      <form className={styles.coachInputCard} onSubmit={(event) => { event.preventDefault(); void answerCoachQuestion(coachQuestion) }}>
        <div className={styles.coachInputHeader}>
          <div>
            <label htmlFor="coach-question">{t('askCoach')}</label>
            <p>{t('askCoachHint')}</p>
          </div>
          <span className={styles.helpHint} title={isPortuguese ? 'Experimente: Porque este treino? · Posso fazer mais leve? · Em que devo concentrar-me?' : 'Try: Why this workout? · Can I go easier? · What should I focus on?'} aria-label={isPortuguese ? 'Exemplos de perguntas' : 'Question examples'}>?</span>
        </div>
        {conversation.length > 0 && (
          <div className={styles.conversationThread} aria-live="polite" aria-label={isPortuguese ? 'Conversa com o treinador' : 'Conversation with coach'}>
            {conversation.slice(-4).map((message) => (
              <div key={message.id} className={message.role === 'athlete' ? styles.athleteMessage : styles.coachMessage}>
                <strong className={styles.messageAuthor}>{message.role === 'athlete' ? (isPortuguese ? 'Você' : 'You') : t('coach')}</strong>
                <div className={styles.messageText}>{message.role === 'coach' ? <RichText text={message.text} /> : message.text}</div>
              </div>
            ))}
            {coachLoading && <div className={`${styles.coachMessage} ${styles.typingMessage}`} aria-label={isPortuguese ? 'O treinador está a responder' : 'Coach is replying'}><span className={styles.typingDots} aria-hidden="true"><i /><i /><i /></span><span>{isPortuguese ? 'A preparar uma resposta…' : 'Preparing a reply…'}</span></div>}
            <div ref={conversationEndRef} aria-hidden="true" />
          </div>
        )}
        {pendingPlan && (
          <article className={styles.proposalCard} aria-label={isPortuguese ? 'Plano de treino proposto' : 'Proposed training plan'}>
            <div className={styles.proposalHeader}><div><p className={styles.cardEyebrow}>{t('planProposal')}</p><h3>{pendingPlan.planName}</h3></div><span className={styles.proposalIcon} aria-hidden="true">✦</span></div>
            <div className={styles.proposalDetails}>
              <div><span>{t('goal')}</span><strong>{pendingPlan.goal?.replace(/_/g, ' ')}</strong></div>
              <div><span>{t('length')}</span><strong>{pendingPlan.desiredPlanWeeks} {isPortuguese ? 'semanas' : 'weeks'}</strong></div>
              <div><span>{t('starts')}</span><input className={styles.proposalDateInput} type="date" value={pendingPlan.planStartDate || ''} onChange={(event) => setPendingPlan((current) => current ? { ...current, planStartDate: event.target.value } : current)} aria-label={t('starts')} /></div>
            </div>
            <p className={styles.proposalPrompt}>{isPortuguese ? 'O seu perfil de atleta e a disponibilidade semanal vão definir o calendário.' : 'Your saved athlete profile and weekly availability will shape the calendar.'}</p>
            <div className={styles.proposalActions}>
              <button type="button" className={styles.primaryAction} onClick={() => { void schedulePendingPlan() }}>{t('schedule')}</button>
              <button type="button" className={styles.secondaryAction} onClick={() => setCoachQuestion(isPortuguese ? 'Alterar o plano: ' : 'Change the plan: ')} disabled={coachLoading}>{t('tweak')}</button>
              <button type="button" className={styles.dismissAction} onClick={() => setPendingPlan(null)} disabled={coachLoading}>{t('dismiss')}</button>
            </div>
          </article>
        )}
        {pendingChange && (
          <article className={styles.proposalCard} aria-label="Proposed session change">
            <div className={styles.proposalHeader}>
              <div><p className={styles.cardEyebrow}>Session proposal</p><h3>{pendingChange.session.type.replace('_', ' ')}</h3></div>
              <span className={styles.proposalIcon} aria-hidden="true">↗</span>
            </div>
            <div className={styles.proposalDetails}>
              <div><span>Duration</span><strong>{pendingChange.session.duration} min</strong></div>
              <div><span>Intensity</span><strong>{pendingChange.session.intensity.replace('_', ' ')}</strong></div>
              <div><span>Focus</span><strong>{pendingChange.session.focus?.[0] || pendingChange.session.description}</strong></div>
            </div>
            <p className={styles.proposalPrompt}>Review this session and confirm before I add or update it in your plan.</p>
            <div className={styles.proposalActions}>
              <button type="button" className={styles.primaryAction} onClick={() => { void onApplyCoachChange(pendingChange.weekNumber, pendingChange.dayOfWeek, pendingChange.session); setPendingChange(null) }}>Confirm session</button>
              <button type="button" className={styles.secondaryAction} onClick={() => onEditSession(pendingChange.weekNumber, pendingChange.dayOfWeek, pendingChange.session)}>Tweak details</button>
              <button type="button" className={styles.dismissAction} onClick={() => setPendingChange(null)}>Dismiss</button>
            </div>
          </article>
        )}
        {pendingDeletion && (
          <article className={styles.proposalCard} aria-label="Proposed session removal">
            <div className={styles.proposalHeader}>
              <div><p className={styles.cardEyebrow}>Session removal</p><h3>Remove {pendingDeletion.label}</h3><p className={styles.proposalMeta}>{pendingDeletion.date}</p></div>
              <span className={styles.proposalIcon} aria-hidden="true">−</span>
            </div>
            <p className={styles.proposalPrompt}>This session will be removed from your plan and Intervals.icu. Do you want me to continue?</p>
            <div className={styles.proposalActions}>
              <button type="button" className={styles.primaryAction} onClick={() => { void onDeleteCoachSession(pendingDeletion.weekNumber, pendingDeletion.dayOfWeek); setPendingDeletion(null) }}>Confirm removal</button>
              <button type="button" className={styles.dismissAction} onClick={() => setPendingDeletion(null)}>Dismiss</button>
            </div>
          </article>
        )}
        {pendingFutureDeletion && (
          <article ref={pendingProposalRef} className={styles.proposalCard} aria-label={isPortuguese ? 'Remoção das sessões futuras' : 'Proposed future session removal'}>
            <div className={styles.proposalHeader}><div><p className={styles.cardEyebrow}>{isPortuguese ? 'Remoção das sessões futuras' : 'Future session removal'}</p><h3>{isPortuguese ? 'Remover sessões futuras' : 'Remove future sessions'}</h3></div><span className={styles.proposalIcon} aria-hidden="true">−</span></div>
            <p className={styles.proposalPrompt}>{isPortuguese ? 'As sessões futuras de treino serão convertidas em dias de descanso. Pretende continuar?' : 'Future training sessions will be converted to rest days. Do you want to continue?'}</p>
            <div className={styles.proposalActions}>
              <button type="button" className={styles.primaryAction} onClick={() => { void onDeleteFutureCoachSessions(); setPendingFutureDeletion(false) }}>{isPortuguese ? 'Confirmar remoção' : 'Confirm removal'}</button>
              <button type="button" className={styles.dismissAction} onClick={() => setPendingFutureDeletion(false)}>{isPortuguese ? 'Dispensar' : 'Dismiss'}</button>
            </div>
          </article>
        )}
        <div className={styles.promptList} aria-label={isPortuguese ? 'Perguntas sugeridas' : 'Suggested questions'}>
          {[['why', 'Why this workout?'], ['easier', 'Can I go easier?'], ['focus', 'What should I focus on?']].map(([key, label]) => (
            <button key={key} type="button" className={selectedPrompt === key ? styles.promptActive : styles.prompt} onClick={() => { setSelectedPrompt(key); void answerCoachQuestion(label) }}>{isPortuguese ? ({'Why this workout?': 'Porque este treino?', 'Can I go easier?': 'Posso fazer mais leve?', 'What should I focus on?': 'Em que devo concentrar-me?'}[label] || label) : label}</button>
          ))}
        </div>
        <div className={styles.coachInputRow}>
          <textarea
            id="coach-question"
            value={coachQuestion}
            onChange={(event) => setCoachQuestion(event.target.value)}
            placeholder={isPortuguese ? 'ex.: Criar um plano de resistência de 12 semanas' : 'e.g. Create a 12-week endurance plan for me'}
            rows={4}
          />
          <button type="submit" className={styles.primaryAction} disabled={coachLoading}>{coachLoading ? (isPortuguese ? 'A pensar…' : 'Thinking…') : (isPortuguese ? 'Perguntar' : 'Ask')}</button>
        </div>
      </form>
    </section>
  )
}
