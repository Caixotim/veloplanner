'use client'

import clsx from 'clsx'
import { useAnalytics } from '@/app/lib/analytics'
import styles from './AnalyticsDashboard.module.scss'

/**
 * Dashboard for viewing analytics and monitoring
 */
/**
 * Analytics Dashboard component
 * Displays event tracking, performance metrics, and analytics data
 */
export function AnalyticsDashboard() {
  const { getDashboard, exportAnalytics } = useAnalytics()
  const dashboard = getDashboard()
  const eventEntries = Object.entries(dashboard.eventsByType) as Array<[string, number]>

  const handleExport = () => {
    const data = exportAnalytics()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `cycling-ai-analytics-${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className={styles.dashboardContainer}>
      <h2>📊 Analytics Dashboard</h2>

      {/* Key Metrics */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.label}>Total Events</div>
          <div className={styles.value}>{dashboard.totalEvents}</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.label}>Plans Created</div>
          <div className={styles.value}>{dashboard.totalPlansCreated}</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.label}>Sessions Edited</div>
          <div className={styles.value}>{dashboard.totalSessionsEdited}</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.label}>Avg Sync Time</div>
          <div className={styles.value}>{dashboard.averageSyncTime.toFixed(0)}ms</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.label}>Sync Errors</div>
          <div className={clsx(styles.value, dashboard.errorCount > 0 && styles.error)}>
            {dashboard.errorCount}
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.label}>Last Sync</div>
          <div className={styles.value}>
            {dashboard.lastSync ? new Date(dashboard.lastSync).toLocaleTimeString() : '—'}
          </div>
        </div>
      </div>

      {/* Event Breakdown */}
      <div className={styles.eventsSection}>
        <h3>Events Breakdown</h3>
        <div className={styles.eventsList}>
          {eventEntries
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => (
              <div key={type} className={styles.eventItem}>
                <span className={styles.eventType}>{type}</span>
                <span className={styles.eventCount}>{count}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Performance Metrics */}
      {dashboard.metrics.length > 0 && (
        <div className={styles.metricsSection}>
          <h3>Performance Metrics</h3>
          <div className={styles.metricsList}>
            {dashboard.metrics.slice(-10).map((metric) => (
              <div key={metric.id} className={styles.metricRow}>
                <span className={styles.metricName}>{metric.name}</span>
                <span className={styles.metricValue}>
                  {metric.value.toFixed(2)} {metric.unit}
                </span>
                <span className={styles.metricTime}>
                  {new Date(metric.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export Button */}
      <div className={styles.actions}>
        <button className={styles.exportBtn} onClick={handleExport}>
          📥 Export Analytics
        </button>
      </div>
    </div>
  )
}
