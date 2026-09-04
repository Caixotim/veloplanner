'use client'

import { useCallback, useEffect, useState } from 'react'
import styles from './SyncStatusPanel.module.scss'

type SyncJob = { id: string; kind: string; status: string; attempts: number; last_error?: string | null; updated_at: string }
type SyncStatus = { connection: { athlete_id: string; expires_at?: string | null } | null; jobs: SyncJob[]; cursors: Array<{ provider: string; cursor: string; updated_at: string }> }

export function SyncStatusPanel() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const response = await fetch('/api/backend/sync-status', { cache: 'no-store' })
    if (response.status === 401) return
    if (!response.ok) throw new Error('Unable to load sync status')
    setStatus(await response.json() as SyncStatus)
  }, [])

  useEffect(() => {
    // The state update occurs after the external fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to load sync status'))
  }, [load])

  const run = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/backend/sync-jobs/run', { method: 'POST' })
      if (response.status === 204) setMessage('No queued sync jobs.')
      else if (!response.ok) throw new Error('Sync run failed')
      else setMessage('Sync job completed or was scheduled for retry.')
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Sync run failed') } finally { setBusy(false) }
  }

  const retry = async (jobId: string) => {
    setBusy(true)
    try {
      const response = await fetch(`/api/backend/sync-jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' })
      if (!response.ok) throw new Error('Unable to retry sync job')
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to retry sync job') } finally { setBusy(false) }
  }

  if (!status) return message ? <p className={styles.message}>{message}</p> : null
  const failedJobs = status.jobs.filter((job) => job.status === 'failed')
  return (
    <section className={styles.panel} aria-labelledby="sync-status-title">
      <div className={styles.header}><div><h2 id="sync-status-title">Sync status</h2><p>{status.connection ? `Intervals athlete ${status.connection.athlete_id}` : 'Intervals is not connected'}</p></div><button type="button" onClick={() => { void run() }} disabled={busy}>{busy ? 'Working…' : 'Run sync'}</button></div>
      {status.cursors.map((cursor) => <p className={styles.detail} key={cursor.provider}>Last {cursor.provider} cursor: {cursor.cursor}</p>)}
      {message && <p className={styles.message}>{message}</p>}
      {failedJobs.length > 0 && <div><h3>Failed jobs</h3><ul className={styles.jobList}>{failedJobs.map((job) => <li className={styles.jobItem} key={job.id}><span>{job.kind}: {job.last_error ?? 'Unknown error'}</span><button type="button" onClick={() => { void retry(job.id) }} disabled={busy}>Retry</button></li>)}</ul></div>}
      {failedJobs.length === 0 && <p className={styles.detail}>No failed jobs.</p>}
    </section>
  )
}
