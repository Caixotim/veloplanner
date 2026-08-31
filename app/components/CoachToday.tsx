'use client'

import { useMemo, useState } from 'react'
import type { DailyReadinessEntry, SessionCompletion, TrainingPlan, TrainingSession, UserProfile } from '../lib/types'
import { buildCoachGuidance } from '../lib/coachGuidance'
import { summarizeReadiness, ReadinessCheckIn } from './ReadinessCheckIn'
import styles from './CoachToday.module.scss'

type CoachTodayProps = {
  plan: TrainingPlan
  userProfile?: Partial<UserProfile>
  readiness?: DailyReadinessEntry
  onSaveReadiness: (entry: DailyReadinessEntry) => Promise<void>
  onOpenCalendar: () => void
  onOpenAnalytics: () => void
  onShowNutrition: () => void
  onLogSession: (weekNumber: number, session: TrainingSession) => void
  onEditSession: (weekNumber: number, dayOfWeek: number, session: TrainingSession) => void
  onApplyCoachChange: (weekNumber: number, dayOfWeek: number, session: TrainingSession) => Promise<void>
  recentRides?: Array<{ date: number; duration: number }>
  completions?: Map<string, SessionCompletion>
}

type CoachMessage = {
  id: number
  role: 'athlete' | 'coach'
  text: string
}

function dateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function CoachToday({
  plan,
  userProfile,
  readiness,
  onSaveReadiness,
  onOpenCalendar,
  onOpenAnalytics,
  onShowNutrition,
  onLogSession,
  onEditSession,
  onApplyCoachChange,
  recentRides = [],
  completions = new Map(),
}: CoachTodayProps) {
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null)
  const [coachQuestion, setCoachQuestion] = useState('')
  const [coachAnswer, setCoachAnswer] = useState<string | null>(null)
  const [conversation, setConversation] = useState<CoachMessage[]>([])
  const [coachLoading, setCoachLoading] = useState(false)
  const [pendingChange, setPendingChange] = useState<{ weekNumber: number; dayOfWeek: number; session: TrainingSession } | null>(null)
  const [coachMode, setCoachMode] = useState<'local' | 'ollama' | 'ai'>('local')
  const [showMetrics, setShowMetrics] = useState(false)
  const [showTodayDetails, setShowTodayDetails] = useState(false)
  const todaySessions = useMemo(() => {
    const today = dateKey(new Date())
    return plan.weeks.flatMap((week, weekIndex) =>
      week.sessions
        .filter((session) => dateKey(session.date) === today)
        .map((session) => ({ session, weekNumber: week.weekNumber || weekIndex + 1, dayOfWeek: session.dayOfWeek }))
    )
  }, [plan.weeks])

  const readinessSummary = summarizeReadiness(readiness)
  const totalMinutes = todaySessions.reduce((sum, item) => sum + item.session.duration, 0)
  const plannedSessions = plan.weeks.reduce((sum, week) => sum + week.sessions.length, 0)
  const completedSessions = Array.from(completions.values()).filter((completion) => completion.status === 'completed').length
  const recentRideHours = recentRides.reduce((sum, ride) => sum + (ride.duration > 600 ? ride.duration / 3600 : ride.duration / 60), 0)
  const latestRide = recentRides[recentRides.length - 1]
  const recentRideBars = recentRides.slice(-7).map((ride) => (ride.duration > 600 ? ride.duration / 60 : ride.duration))
  const maxRideMinutes = Math.max(...recentRideBars, 1)
  const primarySession = todaySessions[0]?.session
  const primaryCompletion = primarySession ? completions.get(primarySession.id) : undefined
  const primaryCompleted = primaryCompletion?.status === 'completed'
  const recommendation = !readiness
    ? 'Check in first. Your readiness will help set the right pace for today.'
    : readinessSummary.tone === 'low'
      ? 'Keep the effort controlled today. Reduce intensity or shorten the session if warm-up feels poor.'
      : readinessSummary.tone === 'ok'
        ? 'Follow the plan, but stay conservative early and only progress if your body feels ready.'
        : 'You have a green light. Execute the planned quality with focus, then recover well.'
  const promptResponse = selectedPrompt === 'why'
    ? primarySession
      ? `${primarySession.type} is scheduled to support your ${plan.goal.replace(/_/g, ' ')} goal. Keep the intended effort controlled; consistency matters more than forcing extra intensity.`
      : 'Today is intentionally open. Recovery creates the capacity to train well on the next quality day.'
    : selectedPrompt === 'easier'
      ? 'Yes. Start with an easy warm-up and reduce duration or intensity if your legs do not come around. Log what you actually did so the next recommendation has better context.'
      : selectedPrompt === 'focus'
        ? primarySession?.focus?.[0] || 'Keep cadence smooth, stay relaxed, and finish with enough energy to recover well.'
        : null

  const answerCoachQuestion = async (question: string) => {
    if (coachLoading) return
    setSelectedPrompt(null)
    const guidance = buildCoachGuidance({ question, plan, session: primarySession, recentRides })
    if (!guidance) return
    if (guidance.shouldShowMetrics) setShowMetrics(true)
    if (guidance.shouldShowToday) setShowTodayDetails(true)
    if (guidance.shouldShowNutrition) onShowNutrition()

    let answer = guidance.answer
    setCoachLoading(true)
    try {
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          context: {
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
            readiness: readiness ? { sleepQuality: readiness.sleepQuality, stressLevel: readiness.stressLevel, muscleSoreness: readiness.muscleSoreness } : null,
            recentRides: recentRides.slice(-14),
          },
        }),
      })
      if (response.ok) {
        const payload = (await response.json()) as { answer?: string; provider?: 'ollama' | 'openai' }
        if (payload.answer) {
          answer = payload.answer
          setCoachMode(payload.provider === 'ollama' ? 'ollama' : 'ai')
        }
      }
    } catch {
      // Keep the local, deterministic answer when the optional AI service is unavailable.
    } finally {
      setCoachLoading(false)
    }

    if (guidance.shouldOpenEditor && guidance.suggestedDurationMinutes && todaySessions[0]) {
      const suggestedDuration = Math.max(15, Math.min(guidance.suggestedDurationMinutes, todaySessions[0].session.duration))
      answer = `I suggested ${suggestedDuration} minutes in the editor. Keep the warm-up, one focused block, and a short cool-down, then save only if the adjustment feels right.`
    }

    setCoachAnswer(answer)
    setConversation((current) => [
      ...current,
      { id: Date.now(), role: 'athlete', text: question.trim() },
      { id: Date.now() + 1, role: 'coach', text: answer },
    ])
    setCoachQuestion('')
    if (guidance.shouldOpenEditor && todaySessions[0]) {
      const suggestedSession = guidance.suggestedDurationMinutes
        ? { ...todaySessions[0].session, duration: Math.max(15, Math.min(guidance.suggestedDurationMinutes, todaySessions[0].session.duration)) }
        : todaySessions[0].session
      onEditSession(todaySessions[0].weekNumber, todaySessions[0].dayOfWeek, suggestedSession)
    }
    if ((guidance.suggestedIntensity || guidance.suggestedDurationMinutes) && todaySessions[0]) {
      const suggestedDuration = guidance.suggestedDurationMinutes
        ? Math.max(15, Math.min(guidance.suggestedDurationMinutes, todaySessions[0].session.duration))
        : todaySessions[0].session.duration
      setPendingChange({
        weekNumber: todaySessions[0].weekNumber,
        dayOfWeek: todaySessions[0].dayOfWeek,
        session: {
          ...todaySessions[0].session,
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

  return (
    <section className={styles.wrapper} aria-labelledby="coach-today-title">
      <div className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>Your daily coach</p>
          <h2 id="coach-today-title">What is the best move today?</h2>
          <p className={styles.introText}>A simple recommendation based on your plan and how you are feeling. Ask for metrics whenever you want the deeper picture.</p>
        </div>
        {showTodayDetails && <div className={`${styles.status} ${styles[`status${readinessSummary.tone}`]}`}>
          <span className={styles.statusDot} />
          <span>{readiness ? readinessSummary.label : 'Check-in needed'}</span>
        </div>}
      </div>

      {showTodayDetails && <div className={styles.primaryGrid}>
        <article className={styles.recommendationCard}>
          <p className={styles.cardEyebrow}>Coach recommendation</p>
          <h3>{primaryCompleted ? 'Workout logged' : primarySession ? primarySession.type : 'Recovery day'}</h3>
          <p>{primaryCompleted ? 'Nice work. Your completed session is now part of your training feedback loop.' : recommendation}</p>
          <div className={styles.sessionMeta}>
            <span>{primarySession ? `${primarySession.duration} min` : 'No scheduled workout'}</span>
            <span>{todaySessions.length > 1 ? `${todaySessions.length} sessions today` : plan.name}</span>
          </div>
          <div className={styles.actions}>
            {primarySession && !primaryCompleted && <button type="button" className={styles.primaryAction} onClick={() => onLogSession(todaySessions[0].weekNumber, primarySession)}>Log workout</button>}
            <button type="button" className={styles.secondaryAction} onClick={onOpenCalendar}>Open calendar</button>
          </div>
        </article>

        <article className={styles.sessionCard}>
          <p className={styles.cardEyebrow}>Today&apos;s plan</p>
          {todaySessions.length === 0 ? (
            <p className={styles.empty}>Nothing scheduled today. Use the calendar to plan an easy ride or rest.</p>
          ) : (
            <ul>
              {todaySessions.map(({ session, weekNumber }) => (
                <li key={session.id}>
                  <div>
                    <strong>{session.type}</strong>
                    <span>{session.duration} min · {session.intensity.replace('_', ' ')}</span>
                  </div>
                  <button type="button" onClick={() => onLogSession(weekNumber, session)}>{completions.get(session.id)?.status === 'completed' ? 'Review' : 'Log'}</button>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.total}>{totalMinutes > 0 ? `${totalMinutes} minutes planned` : 'Recovery is training too'}</div>
        </article>
      </div>}

      <article className={styles.conversationCard}>
        <div>
          <p className={styles.cardEyebrow}>Coach notes</p>
          <h3>Need a little more guidance?</h3>
          <p>{promptResponse || "Choose a question for a quick explanation based on today's plan and readiness."}</p>
        </div>
        <div className={styles.promptList}>
          {[['why', 'Why this workout?'], ['easier', 'Can I go easier?'], ['focus', 'What should I focus on?']].map(([key, label]) => (
            <button key={key} type="button" className={selectedPrompt === key ? styles.promptActive : styles.prompt} onClick={() => { setSelectedPrompt(key); setShowTodayDetails(true) }}>{label}</button>
          ))}
        </div>
      </article>

      <form className={styles.coachInputCard} onSubmit={(event) => { event.preventDefault(); void answerCoachQuestion(coachQuestion) }}>
        <div className={styles.coachInputHeader}>
          <label htmlFor="coach-question">Ask your coach</label>
          <span>{coachMode === 'ollama' ? 'Private local LLM' : coachMode === 'ai' ? 'Hosted AI' : 'Local coach'}</span>
        </div>
        {conversation.length > 0 && (
          <div className={styles.conversationThread} aria-live="polite">
            {conversation.slice(-4).map((message) => (
              <p key={message.id} className={message.role === 'athlete' ? styles.athleteMessage : styles.coachMessage}>
                <strong>{message.role === 'athlete' ? 'You' : 'Coach'}</strong>{message.text}
              </p>
            ))}
          </div>
        )}
        <div className={styles.coachInputRow}>
          <input
            id="coach-question"
            value={coachQuestion}
            onChange={(event) => setCoachQuestion(event.target.value)}
            placeholder="e.g. I only have 45 minutes today"
          />
          <button type="submit" className={styles.primaryAction} disabled={coachLoading}>{coachLoading ? 'Thinking…' : 'Ask'}</button>
        </div>
        {coachAnswer && <p className={styles.coachAnswer} aria-live="polite">{coachAnswer}</p>}
        {pendingChange && (
          <div className={styles.pendingChange}>
            <span>Proposed change: {[
              pendingChange.session.duration !== primarySession?.duration ? `adjust today to ${pendingChange.session.duration} minutes` : null,
              pendingChange.session.intensity !== primarySession?.intensity ? `set intensity to ${pendingChange.session.intensity.replace('_', ' ')}` : null,
              pendingChange.session.type !== primarySession?.type ? `change session to ${pendingChange.session.type === 'vo2max' ? 'VO2 max' : pendingChange.session.type}` : null,
            ].filter(Boolean).join(' and ') || 'review today’s session'}.</span>
            <button type="button" className={styles.primaryAction} onClick={() => { void onApplyCoachChange(pendingChange.weekNumber, pendingChange.dayOfWeek, pendingChange.session); setPendingChange(null) }}>Apply &amp; sync</button>
          </div>
        )}
      </form>

      {showTodayDetails && <div className={styles.secondaryGrid}>
        <div className={styles.readinessCard}>
          <ReadinessCheckIn date={dateKey(new Date())} existingEntry={readiness} onSave={onSaveReadiness} />
        </div>
        <article className={styles.progressCard}>
          <p className={styles.cardEyebrow}>Keep improving</p>
          <h3>See what is changing</h3>
          <p>Review fitness, fatigue, consistency, intensity balance, and threshold trends without making them part of every decision.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.secondaryAction} onClick={() => setShowMetrics((visible) => !visible)}>{showMetrics ? 'Hide metrics' : 'Show metrics'}</button>
            <button type="button" className={styles.secondaryAction} onClick={onOpenAnalytics}>Open progress</button>
          </div>
        </article>
      </div>}

      {showMetrics && <div className={styles.metricStrip} aria-label="Progress snapshot">
        <div><strong>{recentRides.length}</strong><span>rides in recent history</span></div>
        <div><strong>{recentRideHours.toFixed(1)}h</strong><span>recent ride volume</span></div>
        <div><strong>{plannedSessions > 0 ? Math.round((completedSessions / plannedSessions) * 100) : 0}%</strong><span>plan sessions completed</span></div>
        <div><strong>{latestRide ? new Date(latestRide.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}</strong><span>last ride</span></div>
      </div>}

      {showMetrics && <article className={styles.pulseCard} aria-label="Recent ride volume">
        <div>
          <p className={styles.cardEyebrow}>Training pulse</p>
          <h3>Recent ride volume</h3>
          <p>Last seven synced rides, shown as a quick trend rather than a report.</p>
        </div>
        {recentRideBars.length > 0 ? (
          <div className={styles.bars} role="img" aria-label="Bar chart of the duration of the last seven rides">
            {recentRideBars.map((minutes, index) => (
              <span key={`${minutes}-${index}`} style={{ height: `${Math.max(12, (minutes / maxRideMinutes) * 100)}%` }} title={`${Math.round(minutes)} minutes`} />
            ))}
          </div>
        ) : (
          <p className={styles.empty}>Sync Intervals.icu to see your recent training pulse.</p>
        )}
      </article>}
    </section>
  )
}
