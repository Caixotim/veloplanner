'use client'

import { useEffect, useState } from 'react'
import {
  clearIntervalsCredentials,
  getIntervalsCredentials,
  saveIntervalsCredentials,
} from '@/app/lib/integrationCredentials'
import { PlugIcon } from './icons/AppIcons'
import styles from './IntervalsConnection.module.scss'
import { useLocale } from '@/app/lib/i18n'

interface IntervalsConnectionProps {
  onConnectionChange?: (status: { provider: 'intervals' | 'meals'; connected: boolean }) => void
}

type Provider = 'intervals'

export function IntervalsConnection({ onConnectionChange }: IntervalsConnectionProps) {
  const { translateText } = useLocale()
  const [isSaving, setIsSaving] = useState(false)
  const [intervalsConnected, setIntervalsConnected] = useState(false)
  const [activeModal, setActiveModal] = useState<Provider | null>(null)
  const [intervalsApiKey, setIntervalsApiKey] = useState('')
  const [intervalsAthleteId, setIntervalsAthleteId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [intervalsLastValidatedAt, setIntervalsLastValidatedAt] = useState<number | null>(null)

  useEffect(() => {
    const loadCredentialState = async () => {
      try {
        const intervalsCredentials = await getIntervalsCredentials()

        const hasIntervals = Boolean(intervalsCredentials?.apiKey && intervalsCredentials?.athleteId)

        setIntervalsConnected(hasIntervals)
        setIntervalsLastValidatedAt(intervalsCredentials?.updatedAt || null)
      } catch {
        // Keep widget usable even if browser storage is temporarily unavailable.
      }
    }

    loadCredentialState()
  }, [])

  const openConnectModal = (provider: Provider) => {
    setError(null)
    setActiveModal(provider)
  }

  const closeModal = () => {
    setActiveModal(null)
  }

  const handleSaveConnection = async () => {
    if (!activeModal) {
      return
    }

    try {
      setIsSaving(true)
      setError(null)

      if (activeModal === 'intervals') {
        if (!intervalsApiKey.trim() || !intervalsAthleteId.trim()) {
          setError(translateText('Please provide both Intervals API key and Athlete ID.'))
          return
        }

        const testResponse = await fetch('/api/intervals/rides', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-intervals-api-key': intervalsApiKey.trim(),
            'x-intervals-athlete-id': intervalsAthleteId.trim(),
          },
          body: JSON.stringify({ since: 0, forceRefresh: true }),
        })

        if (!testResponse.ok) {
          throw new Error(`Intervals connection test failed (${testResponse.status})`)
        }

        const payload = (await testResponse.json()) as { success?: boolean; error?: string }
        if (payload.success === false) {
          throw new Error(payload.error || translateText('Intervals credentials rejected'))
        }

        await saveIntervalsCredentials({
          apiKey: intervalsApiKey.trim(),
          athleteId: intervalsAthleteId.trim(),
        })

        setIntervalsConnected(true)
        setIntervalsLastValidatedAt(Date.now())
        onConnectionChange?.({ provider: 'intervals', connected: true })
        setIntervalsApiKey('')
        setIntervalsAthleteId('')
      }

      closeModal()
    } catch (err) {
      setError(err instanceof Error ? err.message : translateText('Failed to save connection'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDisconnect = async (provider: Provider) => {
    try {
      if (provider === 'intervals') {
        await clearIntervalsCredentials()
        setIntervalsConnected(false)
        setIntervalsLastValidatedAt(null)
        onConnectionChange?.({ provider: 'intervals', connected: false })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : translateText('Failed to disconnect integration'))
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.icon}><PlugIcon size={26} /></span>
          <h3>{translateText('Integrations')}</h3>
        </div>

        <p className={styles.description}>
          {translateText('Connect provider credentials once per browser. Credentials stay local in your browser storage.')}
        </p>

        <section className={styles.setupGuide} aria-labelledby="intervals-setup-guide-title">
          <h4 id="intervals-setup-guide-title">{translateText('How to connect Intervals.icu')}</h4>
          <ol>
            <li>
              Sign in to Intervals.icu:{' '}
              <a href="https://intervals.icu/" target="_blank" rel="noopener noreferrer">
                https://intervals.icu/
              </a>
            </li>
            <li>
              Open account settings:{' '}
              <a href="https://intervals.icu/settings" target="_blank" rel="noopener noreferrer">
                https://intervals.icu/settings
              </a>
            </li>
            <li>
              In settings, create or copy your API key from the developer/API section and keep it private.
            </li>
            <li>
              Get your Athlete ID from your athlete page URL (example format: <strong>i123456</strong>) or from account/profile settings.
            </li>
            <li>
              In this app, click <strong>Connect Intervals.icu</strong>, paste both values, then click <strong>Save Connection</strong>.
            </li>
            <li>
              Optional reference:{' '}
              <a href="https://intervals.icu/api-docs.html" target="_blank" rel="noopener noreferrer">
                Intervals.icu API docs
              </a>
            </li>
          </ol>
          <p className={styles.setupGuideNote}>
            Tip: if validation fails, double-check that the Athlete ID includes the leading <strong>i</strong>.
          </p>
        </section>

        <div className={styles.providers}>
          <div
            className={`${styles.providerCard} ${intervalsConnected ? styles.providerHealthy : styles.providerDisconnected}`}
          >
            <h4>Intervals.icu</h4>
            <p>Ride sync, FTP updates, plan push/update/delete.</p>
            <div className={styles.healthRow}>
              <span className={intervalsConnected ? styles.healthGood : styles.healthMuted}>
                {intervalsConnected ? 'Healthy connection' : 'Not connected'}
              </span>
              {intervalsLastValidatedAt && (
                <span className={styles.healthTimestamp}>Last validated: {formatLastValidated(intervalsLastValidatedAt)}</span>
              )}
            </div>
            {intervalsConnected ? (
              <>
                <div className={styles.connected}>Connected</div>
                <button onClick={() => handleDisconnect('intervals')} className={styles.disconnectButton}>Disconnect</button>
              </>
            ) : (
              <button onClick={() => openConnectModal('intervals')} className={styles.connectButton}>Connect Intervals.icu</button>
            )}
          </div>

          <div
            className={`${styles.providerCard} ${styles.providerHealthy}`}
          >
            <h4>Meals API</h4>
            <p>Free recipe-backed meal suggestions using TheMealDB with diet-aware shaping and local fallback.</p>
            <div className={styles.healthRow}>
              <span className={styles.healthGood}>Always available</span>
              <span className={styles.healthTimestamp}>Provider: TheMealDB</span>
            </div>
            <div className={styles.connected}>No API key required</div>
          </div>
        </div>

        {error && (
          <div className={styles.error}>
            <span>Error:</span>
            {error}
          </div>
        )}

        {activeModal && (
          <div className={styles.modalBackdrop} onClick={closeModal}>
            <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
              <h4>Connect Intervals.icu</h4>

              <label htmlFor="intervalsApiKey">INTERVALS_ICU_API_KEY</label>
              <input
                id="intervalsApiKey"
                type="password"
                value={intervalsApiKey}
                onChange={(event) => setIntervalsApiKey(event.target.value)}
                placeholder="Paste your Intervals API key"
              />

              <label htmlFor="intervalsAthleteId">INTERVALS_ICU_ATHLETE_ID</label>
              <input
                id="intervalsAthleteId"
                type="text"
                value={intervalsAthleteId}
                onChange={(event) => setIntervalsAthleteId(event.target.value)}
                placeholder="Paste your Intervals athlete ID"
              />
              <p className={styles.fieldHint}>
                Athlete ID usually looks like <strong>i123456</strong> and includes the leading <strong>i</strong>.
              </p>

              <div className={styles.modalActions}>
                <button onClick={closeModal} className={styles.secondaryButton} disabled={isSaving}>Cancel</button>
                <button onClick={handleSaveConnection} className={styles.primaryButton} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Connection'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function formatLastValidated(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}
