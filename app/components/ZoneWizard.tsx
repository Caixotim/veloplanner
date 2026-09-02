'use client'

import { useEffect, useState } from 'react'
import type { TrainingZoneConfig, UserZoneProfile } from '../lib/types'
import styles from './ZoneWizard.module.scss'

const DEFAULT_ZONES: TrainingZoneConfig[] = [
  { label: 'Z1 Recovery', minPct: 0, maxPct: 55, minHRPct: 0, maxHRPct: 68, color: '#b0d4f1' },
  { label: 'Z2 Aerobic', minPct: 56, maxPct: 75, minHRPct: 69, maxHRPct: 83, color: '#83c5e5' },
  { label: 'SS Sweet Spot', minPct: 76, maxPct: 90, minHRPct: 84, maxHRPct: 93, color: '#f0c84e' },
  { label: 'Z3 Tempo', minPct: 76, maxPct: 90, minHRPct: 84, maxHRPct: 93, color: '#f5a623' },
  { label: 'Z4 Threshold', minPct: 91, maxPct: 105, minHRPct: 94, maxHRPct: 100, color: '#e07b39' },
  { label: 'Z5 VO2max', minPct: 106, maxPct: 120, minHRPct: 100, maxHRPct: 106, color: '#d94f3d' },
  { label: 'Z6 Anaerobic', minPct: 121, maxPct: 150, color: '#9b2335' },
]

interface ZoneWizardProps {
  existingProfile?: UserZoneProfile
  defaultFtp?: number
  defaultMaxHR?: number
  onSave: (profile: UserZoneProfile) => void
  onCancel: () => void
}

export default function ZoneWizard({ existingProfile, defaultFtp, defaultMaxHR, onSave, onCancel }: ZoneWizardProps) {
  const [ftp, setFtp] = useState<string>(String(existingProfile?.ftp ?? defaultFtp ?? 200))
  const [maxHR, setMaxHR] = useState<string>(String(existingProfile?.maxHR ?? defaultMaxHR ?? 185))
  const [zones, setZones] = useState<TrainingZoneConfig[]>(existingProfile?.zones ?? DEFAULT_ZONES)

  useEffect(() => {
    if (existingProfile) {
      setFtp(String(existingProfile.ftp))
      setMaxHR(String(existingProfile.maxHR))
      setZones(existingProfile.zones)
    }
  }, [existingProfile])

  const ftpNum = parseInt(ftp, 10) || 200
  const maxHRNum = parseInt(maxHR, 10) || 185

  const updateZone = (index: number, field: keyof TrainingZoneConfig, value: string | number) => {
    setZones((prev) => prev.map((z, i) => (i === index ? { ...z, [field]: typeof value === 'number' ? value : value } : z)))
  }

  const handleSave = () => {
    onSave({
      id: 'active',
      ftp: ftpNum,
      maxHR: maxHRNum,
      zones,
      createdAt: existingProfile?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    })
  }

  const handleReset = () => setZones(DEFAULT_ZONES)

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>Training Zones</h2>
          <button type="button" className={styles.closeBtn} onClick={onCancel} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>
          <p className={styles.intro}>
            Configure your power and heart-rate zones. Zones are used throughout calendars and analytics to show where your sessions sit relative to your thresholds.
          </p>

          <div className={styles.thresholdRow}>
            <div className={styles.thresholdField}>
              <label>FTP (W)</label>
              <input
                type="number"
                min={80}
                max={600}
                value={ftp}
                onChange={(e) => setFtp(e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.thresholdField}>
              <label>Max HR (bpm)</label>
              <input
                type="number"
                min={120}
                max={230}
                value={maxHR}
                onChange={(e) => setMaxHR(e.target.value)}
                className={styles.input}
              />
            </div>
          </div>

          <table className={styles.zoneTable}>
            <thead>
              <tr>
                <th>Zone</th>
                <th>Power min %</th>
                <th>Power max %</th>
                <th>Power range (W)</th>
                <th>HR min %</th>
                <th>HR max %</th>
                <th>HR range (bpm)</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((zone, index) => {
                const pMin = Math.round((zone.minPct / 100) * ftpNum)
                const pMax = Math.round((zone.maxPct / 100) * ftpNum)
                const hMin = zone.minHRPct != null ? Math.round((zone.minHRPct / 100) * maxHRNum) : null
                const hMax = zone.maxHRPct != null ? Math.round((zone.maxHRPct / 100) * maxHRNum) : null

                return (
                  <tr key={index} style={{ borderLeft: `4px solid ${zone.color || 'var(--theme-accent)'}` }}>
                    <td>
                      <span className={styles.zoneDot} style={{ background: zone.color }} />
                      <input
                        type="text"
                        value={zone.label}
                        onChange={(e) => updateZone(index, 'label', e.target.value)}
                        className={styles.labelInput}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={300}
                        value={zone.minPct}
                        onChange={(e) => updateZone(index, 'minPct', parseInt(e.target.value, 10) || 0)}
                        className={styles.pctInput}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={300}
                        value={zone.maxPct}
                        onChange={(e) => updateZone(index, 'maxPct', parseInt(e.target.value, 10) || 0)}
                        className={styles.pctInput}
                      />
                    </td>
                    <td className={styles.derived}>{pMin}–{pMax} W</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={200}
                        value={zone.minHRPct ?? ''}
                        onChange={(e) => updateZone(index, 'minHRPct', parseInt(e.target.value, 10) || 0)}
                        className={styles.pctInput}
                        placeholder="—"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={200}
                        value={zone.maxHRPct ?? ''}
                        onChange={(e) => updateZone(index, 'maxHRPct', parseInt(e.target.value, 10) || 0)}
                        className={styles.pctInput}
                        placeholder="—"
                      />
                    </td>
                    <td className={styles.derived}>
                      {hMin != null && hMax != null ? `${hMin}–${hMax} bpm` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.btnReset} onClick={handleReset}>Reset Defaults</button>
          <button type="button" className={styles.btnCancel} onClick={onCancel}>Cancel</button>
          <button type="button" className={styles.btnSave} onClick={handleSave}>Save Zones</button>
        </div>
      </div>
    </div>
  )
}
