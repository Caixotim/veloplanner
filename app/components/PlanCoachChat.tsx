'use client'

import { useState } from 'react'
import type { UserProfile } from '../lib/types'
import { useLocale } from '../lib/i18n'
import { parsePlanStartDate } from '../lib/planRequest'
import styles from './CoachToday.module.scss'

type PlanCoachChatProps = { onCreatePlan: (profile: Partial<UserProfile>) => Promise<void>; loading?: boolean }

export default function PlanCoachChat({ onCreatePlan, loading = false }: PlanCoachChatProps) {
  const { isPortuguese, t } = useLocale()
  const [request, setRequest] = useState('')
  const [proposal, setProposal] = useState<Partial<UserProfile> | null>(null)
  const [message, setMessage] = useState(t('planRequestHint'))
  const [scheduling, setScheduling] = useState(false)

  const understandRequest = () => {
    const text = request.trim().toLowerCase()
    if (!text) return
    const goal = text.includes('climb') || text.includes('hill') ? 'climbing_sustainability' : text.includes('endurance') || text.includes('long') ? 'endurance' : text.includes('recover') ? 'recovery' : 'ftp_increase'
    const weeks = Number(text.match(/(\d+)\s*weeks?/)?.[1] || 12)
    const startDate = parsePlanStartDate(text)
    const next = {
      planName: `${goal.replace(/_/g, ' ')} plan`,
      goal: goal as UserProfile['goal'],
      desiredPlanWeeks: Math.max(4, Math.min(30, weeks)),
      planStartDate: startDate,
    }
    setProposal(next)
    setMessage(isPortuguese ? 'Percebi o seu pedido. Reveja o plano abaixo e escolha Agendar, Ajustar ou Dispensar.' : 'I understood your request. Review the schedule below, then choose Schedule, Tweak, or Dismiss.')
  }

  const schedulePlan = async () => {
    if (!proposal || scheduling) return

    const submittedProposal = proposal
    setScheduling(true)
    setProposal(null)
    setMessage(isPortuguese ? 'A criar o seu plano…' : 'Creating your plan…')

    try {
      await onCreatePlan(submittedProposal)
      setRequest('')
      setMessage(isPortuguese ? 'Plano criado e adicionado ao calendário.' : 'Plan created and added to the calendar.')
    } catch (error) {
      setProposal(submittedProposal)
      setMessage(error instanceof Error ? error.message : (isPortuguese ? 'Não foi possível criar o plano.' : 'The plan could not be created.'))
    } finally {
      setScheduling(false)
    }
  }

  return <section className={styles.coachInputCard} aria-labelledby="plan-coach-title">
    <p className={styles.eyebrow}>{isPortuguese ? 'O seu treinador' : 'Your coach'}</p>
    <h1 id="plan-coach-title">{isPortuguese ? 'Vamos criar o seu plano' : 'Let&apos;s build your plan'}</h1>
    <p className={styles.coachAnswer}>{message}</p>
    <div className={styles.coachInputRow}>
      <input value={request} onChange={(event) => setRequest(event.target.value)} placeholder={isPortuguese ? 'ex.: Criar resistência durante 12 semanas' : 'e.g. Build endurance for 12 weeks'} disabled={loading} aria-label={isPortuguese ? 'Descreva o seu plano de treino' : 'Describe your training plan'} />
      <button type="button" className={styles.primaryAction} onClick={understandRequest} disabled={loading || scheduling || !request.trim()}>{t('reviewPlan')}</button>
    </div>
    {proposal && (
      <article className={styles.proposalCard} aria-label="Proposed training plan">
        <div className={styles.proposalHeader}>
          <div>
            <p className={styles.cardEyebrow}>{t('planProposal')}</p>
            <h2>{proposal.planName}</h2>
          </div>
          <span className={styles.proposalIcon} aria-hidden="true">✦</span>
        </div>
        <div className={styles.proposalDetails}>
          <div><span>{t('goal')}</span><strong>{proposal.goal?.replace(/_/g, ' ')}</strong></div>
          <div><span>{t('length')}</span><strong>{proposal.desiredPlanWeeks} {isPortuguese ? 'semanas' : 'weeks'}</strong></div>
          <div><span>{t('starts')}</span><input type="date" value={proposal.planStartDate || ''} onChange={(event) => setProposal((current) => current ? { ...current, planStartDate: event.target.value } : current)} aria-label={t('starts')} /></div>
        </div>
        <p className={styles.proposalPrompt}>{t('proposalPrompt')}</p>
        <div className={styles.proposalActions}>
          <button type="button" className={styles.primaryAction} onClick={() => { void schedulePlan() }} disabled={loading || scheduling}>
            {loading || scheduling ? t('creating') : t('schedule')}
          </button>
          <button type="button" className={styles.secondaryAction} onClick={() => setMessage(isPortuguese ? 'Diga-me o que pretende alterar, como a duração, a data de início, o objectivo ou os dias disponíveis.' : 'Tell me what you want changed, such as duration, start date, goal, or available days.')} disabled={loading}>{t('tweak')}</button>
          <button type="button" className={styles.dismissAction} onClick={() => setProposal(null)} disabled={loading}>{t('dismiss')}</button>
        </div>
      </article>
    )}
  </section>
}
