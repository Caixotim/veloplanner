/**
 * Analytics and monitoring for CyclingAI
 * Tracks user actions, performance metrics, and errors
 */

import { storage } from './storage'


/**
 * Event types that can be tracked
 */
export type EventType =
  | 'plan_created'
  | 'plan_edited'
  | 'session_edited'
  | 'plan_saved'
  | 'plan_exported'
  | 'plan_restored_from_intervals'
  | 'intervals_sync_started'
  | 'intervals_sync_completed'
  | 'intervals_sync_failed'
  | 'intervals_authenticated'
  | 'intervals_disconnected'
  | 'power_meter_enabled'
  | 'power_meter_disabled'

/**
 * Represents a tracked event
 */
export interface AnalyticsEvent {
  id: string
  type: EventType
  timestamp: number
  data?: Record<string, unknown>
  duration?: number // milliseconds for timed events
}

/**
 * Performance metric
 */
export interface PerformanceMetric {
  id: string
  name: string
  value: number
  unit: string
  timestamp: number
  context?: Record<string, unknown>
}

/**
 * Analytics dashboard data
 */
export interface AnalyticsDashboard {
  totalEvents: number
  eventsByType: Record<EventType, number>
  totalPlansCreated: number
  totalSessionsEdited: number
  averageSyncTime: number
  lastSync: number | null
  errorCount: number
  metrics: PerformanceMetric[]
}

/**
 * Analytics manager - singleton for tracking events
 */
class AnalyticsManager {
  private eventBuffer: AnalyticsEvent[] = []
  private metricsBuffer: PerformanceMetric[] = []
  private timedEvents: Map<string, number> = new Map()

  /**
   * Track an event
   */
  trackEvent(type: EventType, data?: Record<string, unknown>): string {
    const event: AnalyticsEvent = {
      id: `event_${Date.now()}_${Math.random()}`,
      type,
      timestamp: Date.now(),
      data,
    }

    this.eventBuffer.push(event)

    // Keep only last 1000 events in memory
    if (this.eventBuffer.length > 1000) {
      this.eventBuffer = this.eventBuffer.slice(-1000)
    }

    console.info('Event tracked', { type, data })
    return event.id
  }

  /**
   * Start timing an event
   */
  startTimer(eventName: string): void {
    this.timedEvents.set(eventName, Date.now())
  }

  /**
   * End timing an event and track it
   */
  endTimer(eventName: string, eventType: EventType, data?: Record<string, unknown>): void {
    const startTime = this.timedEvents.get(eventName)
    if (!startTime) {
      console.warn('Timer not found', { eventName })
      return
    }

    const duration = Date.now() - startTime
    this.timedEvents.delete(eventName)

    const event: AnalyticsEvent = {
      id: `event_${Date.now()}_${Math.random()}`,
      type: eventType,
      timestamp: Date.now(),
      data,
      duration,
    }

    this.eventBuffer.push(event)

    if (this.eventBuffer.length > 1000) {
      this.eventBuffer = this.eventBuffer.slice(-1000)
    }

    console.info('Timed event tracked', { type: eventType, duration, data })
  }

  /**
   * Track a performance metric
   */
  trackMetric(name: string, value: number, unit: string = 'ms', context?: Record<string, unknown>): void {
    const metric: PerformanceMetric = {
      id: `metric_${Date.now()}_${Math.random()}`,
      name,
      value,
      unit,
      timestamp: Date.now(),
      context,
    }

    this.metricsBuffer.push(metric)

    // Keep only last 500 metrics in memory
    if (this.metricsBuffer.length > 500) {
      this.metricsBuffer = this.metricsBuffer.slice(-500)
    }

    console.debug('Metric tracked', { name, value, unit })
  }

  /**
   * Get all tracked events
   */
  getEvents(limit: number = 100): AnalyticsEvent[] {
    return this.eventBuffer.slice(-limit)
  }

  /**
   * Get all tracked metrics
   */
  getMetrics(limit: number = 50): PerformanceMetric[] {
    return this.metricsBuffer.slice(-limit)
  }

  /**
   * Generate dashboard data
   */
  getDashboard(): AnalyticsDashboard {
    const eventsByType: Record<EventType, number> = {} as Record<EventType, number>

    for (const event of this.eventBuffer) {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1
    }

    const syncEvents = this.eventBuffer.filter((e) => e.type === 'intervals_sync_completed')
    const syncTimes = syncEvents
      .filter((e) => e.duration !== undefined)
      .map((e) => e.duration || 0)

    const averageSyncTime = syncTimes.length > 0 ? syncTimes.reduce((a, b) => a + b, 0) / syncTimes.length : 0

    const lastSyncEvent = syncEvents[syncEvents.length - 1]

    return {
      totalEvents: this.eventBuffer.length,
      eventsByType,
      totalPlansCreated: eventsByType['plan_created'] || 0,
      totalSessionsEdited: eventsByType['session_edited'] || 0,
      averageSyncTime,
      lastSync: lastSyncEvent?.timestamp || null,
      errorCount: eventsByType['intervals_sync_failed'] || 0,
      metrics: this.getMetrics(20),
    }
  }

  /**
   * Export analytics to JSON for download
   */
  exportAnalytics(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        events: this.eventBuffer,
        metrics: this.metricsBuffer,
        dashboard: this.getDashboard(),
      },
      null,
      2
    )
  }

  /**
   * Clear all analytics data
   */
  clear(): void {
    this.eventBuffer = []
    this.metricsBuffer = []
    this.timedEvents.clear()
    console.info('Analytics data cleared')
  }
}

// Export singleton instance
export const analytics = new AnalyticsManager()

const trackEvent = analytics.trackEvent.bind(analytics)
const startTimer = analytics.startTimer.bind(analytics)
const endTimer = analytics.endTimer.bind(analytics)
const trackMetric = analytics.trackMetric.bind(analytics)
const getDashboard = analytics.getDashboard.bind(analytics)
const exportAnalytics = analytics.exportAnalytics.bind(analytics)

/**
 * Hook for React components to use analytics
 */
export function useAnalytics() {
  return {
    trackEvent,
    startTimer,
    endTimer,
    trackMetric,
    getDashboard,
    exportAnalytics,
  }
}
