import { BodyMetricsEntry, DailyReadinessEntry, UserProfile, TrainingPlan, SessionCompletion, UserZoneProfile } from './types'
import { hydrateTrainingPlanDates } from './planDateHydration'

/**
 * Metadata tracking Intervals sync status and history
 */
export interface SyncMetadata {
  key?: string
  lastSyncTime: number // Timestamp in ms
  lastSyncStatus: 'success' | 'error' | 'pending'
  totalRidesSynced: number
  profileSnapshotsCount?: number
  lastError?: string
}

/**
 * Records an edit made to a training session
 */
export interface SessionEdit {
  sessionId: string
  weekNumber: number
  dayIndex: number
  timestamp: number
  changes: Record<string, { before: unknown; after: unknown }>
}

/**
 * Versioned plan storage with edit history
 */
export interface StoredPlan {
  id: string
  plan: TrainingPlan
  originalPlan: TrainingPlan
  createdAt: number
  updatedAt: number
  edits: SessionEdit[]
  isModified: boolean
}

export type IntegrationProvider = 'intervals'

export interface IntegrationCredentials {
  provider: IntegrationProvider
  apiKey: string
  athleteId?: string
  createdAt: number
  updatedAt: number
}

/**
 * IndexedDB Store Manager for CyclingAI
 * Handles persistence of plans, profiles, and sync metadata
 */
class StorageManager {
  private db: IDBDatabase | null = null
  private readonly baseDbName = 'CyclingAI'
  private dbName = this.baseDbName
  private readonly version = 6
  private readonly activeProfileKey = 'active-profile'

  /**
   * Switch the local cache to an account-specific database. Passing no ID
   * selects the legacy anonymous database used before authentication.
   * Existing connections are closed before the next operation opens the new
   * namespace, preventing cached data from leaking across accounts.
   */
  async setAccountScope(accountId?: string): Promise<void> {
    const nextDbName = accountId ? `${this.baseDbName}:account:${encodeURIComponent(accountId)}` : this.baseDbName
    if (nextDbName === this.dbName) return
    this.db?.close()
    this.db = null
    this.dbName = nextDbName
  }

  /**
   * Initialize IndexedDB database and create stores
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error}`))
      }

      request.onblocked = () => {
        reject(new Error('IndexedDB upgrade is blocked by another open tab. Reload other VeloPlanner tabs and try again.'))
      }

      request.onsuccess = () => {
        this.db = request.result
        this.db.onversionchange = () => {
          this.db?.close()
          this.db = null
        }
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Profiles store
        if (!db.objectStoreNames.contains('profiles')) {
          const profileStore = db.createObjectStore('profiles', { keyPath: 'id' })
          profileStore.createIndex('createdAt', 'createdAt', { unique: false })
        }

        // Plans store
        if (!db.objectStoreNames.contains('plans')) {
          const planStore = db.createObjectStore('plans', { keyPath: 'id' })
          planStore.createIndex('createdAt', 'createdAt', { unique: false })
          planStore.createIndex('updatedAt', 'updatedAt', { unique: false })
        }

        // Sync metadata store
        if (!db.objectStoreNames.contains('syncMetadata')) {
          db.createObjectStore('syncMetadata', { keyPath: 'key' })
        }

        // Edit history store
        if (!db.objectStoreNames.contains('editHistory')) {
          const editStore = db.createObjectStore('editHistory', { keyPath: 'id', autoIncrement: true })
          editStore.createIndex('planId', 'planId', { unique: false })
          editStore.createIndex('timestamp', 'timestamp', { unique: false })
        }

        // Intervals rides cache
        if (!db.objectStoreNames.contains('intervalsRides')) {
          const ridesStore = db.createObjectStore('intervalsRides', { keyPath: 'id' })
          ridesStore.createIndex('rideDate', 'rideDate', { unique: false })
        }

        // Integration credentials (per-browser storage)
        if (!db.objectStoreNames.contains('integrationCredentials')) {
          db.createObjectStore('integrationCredentials', { keyPath: 'provider' })
        }

        // Session completions (done/skipped/RPE log)
        if (!db.objectStoreNames.contains('sessionCompletions')) {
          const completionStore = db.createObjectStore('sessionCompletions', { keyPath: 'sessionId' })
          completionStore.createIndex('planId', 'planId', { unique: false })
          completionStore.createIndex('completedAt', 'completedAt', { unique: false })
        }

        // User zone profiles
        if (!db.objectStoreNames.contains('zoneProfiles')) {
          db.createObjectStore('zoneProfiles', { keyPath: 'id' })
        }

        // Daily readiness check-ins
        if (!db.objectStoreNames.contains('dailyReadiness')) {
          const readinessStore = db.createObjectStore('dailyReadiness', { keyPath: 'date' })
          readinessStore.createIndex('updatedAt', 'updatedAt', { unique: false })
        }

        // Body metrics time-series
        if (!db.objectStoreNames.contains('bodyMetrics')) {
          const bodyMetricsStore = db.createObjectStore('bodyMetrics', { keyPath: 'date' })
          bodyMetricsStore.createIndex('updatedAt', 'updatedAt', { unique: false })
        }
      }
    })
  }

  /**
   * Save a user profile
   */
  async saveProfile(profile: UserProfile): Promise<void> {
    if (!this.db) await this.init()

    // Keep a single active profile record and only increment a snapshot counter.
    const existing = await this.loadProfile(this.activeProfileKey)

    const tx = this.db!.transaction(['profiles'], 'readwrite')
    const store = tx.objectStore('profiles')
    const data = {
      ...profile,
      id: this.activeProfileKey,
      createdAt: profile.createdAt || existing?.createdAt || Date.now(),
      updatedAt: profile.updatedAt || new Date(),
    }
    await new Promise<void>((resolve, reject) => {
      const request = store.put(data)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })

    const metadata = await this.getSyncMetadata()
    await this.updateSyncMetadata({
      profileSnapshotsCount: (metadata.profileSnapshotsCount || 0) + 1,
    })
  }

  /**
   * Load all profiles
   */
  async loadProfiles(): Promise<(UserProfile & { id: string; createdAt: number })[]> {
    if (!this.db) await this.init()

    const tx = this.db!.transaction(['profiles'], 'readonly')
    const store = tx.objectStore('profiles')
    return new Promise((resolve, reject) => {
      const activeRequest = store.get(this.activeProfileKey)
      activeRequest.onsuccess = () => {
        if (activeRequest.result) {
          resolve([activeRequest.result])
          return
        }

        // Backward-compatible fallback for legacy data before active-profile compaction.
        const allRequest = store.getAll()
        allRequest.onsuccess = () => {
          const allProfiles = (allRequest.result || []) as Array<UserProfile & { id: string; createdAt: number; updatedAt?: Date | number | string }>
          if (allProfiles.length === 0) {
            resolve([])
            return
          }

          const latestProfile = [...allProfiles].sort((left, right) => {
            const leftUpdated = Number(new Date((left.updatedAt as unknown as Date) || left.createdAt || 0))
            const rightUpdated = Number(new Date((right.updatedAt as unknown as Date) || right.createdAt || 0))
            return rightUpdated - leftUpdated
          })[0]

          resolve(latestProfile ? [latestProfile] : [])
        }
        allRequest.onerror = () => reject(allRequest.error)
      }
      activeRequest.onerror = () => reject(activeRequest.error)
    })
  }

  async getProfileSnapshotCount(): Promise<number> {
    const metadata = await this.getSyncMetadata()
    return metadata.profileSnapshotsCount || 0
  }

  /**
   * Load a user profile by ID
   */
  async loadProfile(profileId: string): Promise<UserProfile | undefined> {
    if (!this.db) await this.init()

    const tx = this.db!.transaction(['profiles'], 'readonly')
    const store = tx.objectStore('profiles')

    return new Promise((resolve, reject) => {
      const request = store.get(profileId)
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result)
          return
        }

        const activeRequest = store.get(this.activeProfileKey)
        activeRequest.onsuccess = () => resolve(activeRequest.result)
        activeRequest.onerror = () => reject(activeRequest.error)
      }
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Save a training plan
   */
  async savePlan(plan: TrainingPlan, isNew = true): Promise<string> {
    if (!this.db) await this.init()

    const planId = plan.id
    const tx = this.db!.transaction(['plans'], 'readwrite')
    const store = tx.objectStore('plans')

    const normalizedPlan = hydrateTrainingPlanDates(plan) || plan

    const storedPlan: StoredPlan = {
      id: planId,
      plan: normalizedPlan,
      originalPlan: isNew ? { ...normalizedPlan } : normalizedPlan,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      edits: [],
      isModified: false,
    }

    return new Promise((resolve, reject) => {
      const request = store.put(storedPlan)
      request.onsuccess = () => resolve(planId)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Replace a cached plan snapshot without recording a local edit.
   * Cloud reads use this to refresh the cache while preserving local metadata.
   */
  async cachePlan(storedPlan: StoredPlan): Promise<void> {
    if (!this.db) await this.init()

    const existing = await this.loadPlan(storedPlan.id)
    const snapshot: StoredPlan = {
      ...(existing ?? storedPlan),
      ...storedPlan,
      plan: hydrateTrainingPlanDates(storedPlan.plan) || storedPlan.plan,
      originalPlan: existing?.originalPlan ?? storedPlan.originalPlan,
      edits: existing?.edits ?? storedPlan.edits,
      isModified: existing?.isModified ?? storedPlan.isModified,
    }
    const tx = this.db!.transaction(['plans'], 'readwrite')
    return new Promise((resolve, reject) => {
      const request = tx.objectStore('plans').put(snapshot)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Load a training plan by ID
   */
  async loadPlan(planId: string): Promise<StoredPlan | undefined> {
    if (!this.db) await this.init()

    const tx = this.db!.transaction(['plans'], 'readonly')
    const store = tx.objectStore('plans')
    return new Promise((resolve, reject) => {
      const request = store.get(planId)
      request.onsuccess = () => resolve(hydrateStoredPlan(request.result))
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Load all stored plans
   */
  async loadAllPlans(): Promise<StoredPlan[]> {
    if (!this.db) await this.init()

    const tx = this.db!.transaction(['plans'], 'readonly')
    const store = tx.objectStore('plans')
    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => {
        const hydrated = request.result
          .map((entry) => hydrateStoredPlan(entry))
          .filter((entry): entry is StoredPlan => entry !== undefined)
        resolve(hydrated)
      }
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Update a training plan
   */
  async updatePlan(planId: string, updates: Partial<TrainingPlan>): Promise<void> {
    if (!this.db) await this.init()

    const stored = await this.loadPlan(planId)
    if (!stored) throw new Error(`Plan ${planId} not found`)

    const tx = this.db!.transaction(['plans'], 'readwrite')
    const store = tx.objectStore('plans')

    const updated: StoredPlan = {
      ...stored,
      plan: { ...stored.plan, ...updates },
      updatedAt: Date.now(),
      isModified: true,
    }

    return new Promise((resolve, reject) => {
      const request = store.put(updated)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Delete a training plan by ID
   */
  async deletePlan(planId: string): Promise<void> {
    if (!this.db) await this.init()

    const tx = this.db!.transaction(['plans'], 'readwrite')
    const store = tx.objectStore('plans')

    return new Promise((resolve, reject) => {
      const request = store.delete(planId)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Record a session edit
   */
  async recordEdit(planId: string, edit: Omit<SessionEdit, 'id'>): Promise<void> {
    if (!this.db) await this.init()

    const tx = this.db!.transaction(['editHistory'], 'readwrite')
    const store = tx.objectStore('editHistory')

    const data = {
      planId,
      ...edit,
    }

    return new Promise((resolve, reject) => {
      const request = store.add(data)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get edit history for a plan
   */
  async getEditHistory(planId: string): Promise<SessionEdit[]> {
    if (!this.db) await this.init()

    const tx = this.db!.transaction(['editHistory'], 'readonly')
    const store = tx.objectStore('editHistory')
    const index = store.index('planId')

    return new Promise((resolve, reject) => {
      const request = index.getAll(planId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get current Intervals sync metadata
   */
  async getSyncMetadata(): Promise<SyncMetadata> {
    if (!this.db) await this.init()

    const tx = this.db!.transaction(['syncMetadata'], 'readonly')
    const store = tx.objectStore('syncMetadata')

    return new Promise((resolve, reject) => {
      const request = store.get('intervals')
      request.onsuccess = () => {
        const result = request.result
        if (result) {
          resolve(result)
          return
        }

        // Backward-compatible fallback for data created before the rename.
        const legacyRequest = store.get('sram')
        legacyRequest.onsuccess = () => {
          const legacy = legacyRequest.result
          if (legacy) {
            resolve({
              ...legacy,
              key: 'intervals',
            })
            return
          }

          resolve({
            key: 'intervals',
            lastSyncTime: 0,
            lastSyncStatus: 'pending',
            totalRidesSynced: 0,
            profileSnapshotsCount: 0,
          })
        }
        legacyRequest.onerror = () => reject(legacyRequest.error)
      }
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Update Intervals sync metadata
   */
  async updateSyncMetadata(metadata: Partial<SyncMetadata>): Promise<void> {
    if (!this.db) await this.init()

    const current = await this.getSyncMetadata()
    const updated: SyncMetadata = {
      ...current,
      ...metadata,
    }

    const tx = this.db!.transaction(['syncMetadata'], 'readwrite')
    const store = tx.objectStore('syncMetadata')

    return new Promise((resolve, reject) => {
      const request = store.put({ key: 'intervals', ...updated })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Cache Intervals ride data
   */
  async cacheRide(rideId: string, rideData: Record<string, unknown>): Promise<void> {
    if (!this.db) await this.init()

    const ridesStoreName = this.getRidesStoreName()
    const tx = this.db!.transaction([ridesStoreName], 'readwrite')
    const store = tx.objectStore(ridesStoreName)

    return new Promise((resolve, reject) => {
      const request = store.put({
        id: rideId,
        ...rideData,
        cachedAt: Date.now(),
      })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get cached rides after a specific date
   */
  async getCachedRides(afterTimestamp: number): Promise<Record<string, unknown>[]> {
    if (!this.db) await this.init()

    const ridesStoreName = this.getRidesStoreName()
    const tx = this.db!.transaction([ridesStoreName], 'readonly')
    const store = tx.objectStore(ridesStoreName)
    const index = store.index('rideDate')

    return new Promise((resolve, reject) => {
      const range = IDBKeyRange.lowerBound(afterTimestamp)
      const request = index.getAll(range)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Clean up old data (30+ days old)
   */
  async cleanup(): Promise<void> {
    if (!this.db) await this.init()

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const tx = this.db!.transaction(['plans', 'editHistory'], 'readwrite')

    // Clean old plans
    const planStore = tx.objectStore('plans')
    const planIndex = planStore.index('createdAt')
    const oldPlansRange = IDBKeyRange.upperBound(thirtyDaysAgo)

    return new Promise((resolve, reject) => {
      const deleteRequest = planIndex.openCursor(oldPlansRange)
      deleteRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        } else {
          resolve()
        }
      }
      deleteRequest.onerror = () => reject(deleteRequest.error)
    })
  }

  private getRidesStoreName(): 'intervalsRides' | 'sramRides' {
    if (this.db?.objectStoreNames.contains('intervalsRides')) {
      return 'intervalsRides'
    }

    return 'sramRides'
  }

  async saveIntegrationCredentials(
    provider: IntegrationProvider,
    payload: { apiKey: string; athleteId?: string }
  ): Promise<void> {
    if (!this.db) await this.init()

    const trimmedApiKey = payload.apiKey.trim()
    const trimmedAthleteId = payload.athleteId?.trim()

    if (!trimmedApiKey) {
      throw new Error('API key is required')
    }

    if (provider === 'intervals' && !trimmedAthleteId) {
      throw new Error('Athlete ID is required for Intervals')
    }

    const existing = await this.getIntegrationCredentials(provider)
    const now = Date.now()

    const value: IntegrationCredentials = {
      provider,
      apiKey: trimmedApiKey,
      athleteId: trimmedAthleteId,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    }

    const tx = this.db!.transaction(['integrationCredentials'], 'readwrite')
    const store = tx.objectStore('integrationCredentials')

    return new Promise((resolve, reject) => {
      const request = store.put(value)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getIntegrationCredentials(provider: IntegrationProvider): Promise<IntegrationCredentials | undefined> {
    if (!this.db) await this.init()

    const tx = this.db!.transaction(['integrationCredentials'], 'readonly')
    const store = tx.objectStore('integrationCredentials')

    return new Promise((resolve, reject) => {
      const request = store.get(provider)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async removeIntegrationCredentials(provider: IntegrationProvider): Promise<void> {
    if (!this.db) await this.init()

    const tx = this.db!.transaction(['integrationCredentials'], 'readwrite')
    const store = tx.objectStore('integrationCredentials')

    return new Promise((resolve, reject) => {
      const request = store.delete(provider)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // ── Session completion CRUD ──────────────────────────────────

  async saveCompletion(completion: SessionCompletion): Promise<void> {
    if (!this.db) await this.init()
    const tx = this.db!.transaction(['sessionCompletions'], 'readwrite')
    const store = tx.objectStore('sessionCompletions')
    return new Promise((resolve, reject) => {
      const request = store.put(completion)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getCompletion(sessionId: string): Promise<SessionCompletion | undefined> {
    if (!this.db) await this.init()
    const tx = this.db!.transaction(['sessionCompletions'], 'readonly')
    const store = tx.objectStore('sessionCompletions')
    return new Promise((resolve, reject) => {
      const request = store.get(sessionId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getCompletionsForPlan(planId: string): Promise<SessionCompletion[]> {
    if (!this.db) await this.init()
    const tx = this.db!.transaction(['sessionCompletions'], 'readonly')
    const store = tx.objectStore('sessionCompletions')
    const index = store.index('planId')
    return new Promise((resolve, reject) => {
      const request = index.getAll(planId)
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  }

  async deleteCompletion(sessionId: string): Promise<void> {
    if (!this.db) await this.init()
    const tx = this.db!.transaction(['sessionCompletions'], 'readwrite')
    const store = tx.objectStore('sessionCompletions')
    return new Promise((resolve, reject) => {
      const request = store.delete(sessionId)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // ── Zone profile CRUD ────────────────────────────────────────

  async saveZoneProfile(profile: UserZoneProfile): Promise<void> {
    if (!this.db) await this.init()
    const tx = this.db!.transaction(['zoneProfiles'], 'readwrite')
    const store = tx.objectStore('zoneProfiles')
    return new Promise((resolve, reject) => {
      const request = store.put(profile)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getZoneProfile(): Promise<UserZoneProfile | undefined> {
    if (!this.db) await this.init()
    const tx = this.db!.transaction(['zoneProfiles'], 'readonly')
    const store = tx.objectStore('zoneProfiles')
    return new Promise((resolve, reject) => {
      const request = store.get('active')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async saveDailyReadiness(entry: DailyReadinessEntry): Promise<void> {
    if (!this.db) await this.init()

    const tx = this.db!.transaction(['dailyReadiness'], 'readwrite')
    const store = tx.objectStore('dailyReadiness')
    const value: DailyReadinessEntry = {
      ...entry,
      updatedAt: entry.updatedAt || Date.now(),
    }

    return new Promise((resolve, reject) => {
      const request = store.put(value)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getDailyReadiness(date: string): Promise<DailyReadinessEntry | undefined> {
    if (!this.db) await this.init()

    const tx = this.db!.transaction(['dailyReadiness'], 'readonly')
    const store = tx.objectStore('dailyReadiness')

    return new Promise((resolve, reject) => {
      const request = store.get(date)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async saveBodyMetrics(entry: BodyMetricsEntry): Promise<void> {
    if (!this.db) await this.init()

    const tx = this.db!.transaction(['bodyMetrics'], 'readwrite')
    const store = tx.objectStore('bodyMetrics')
    const value: BodyMetricsEntry = {
      ...entry,
      updatedAt: entry.updatedAt || Date.now(),
    }

    return new Promise((resolve, reject) => {
      const request = store.put(value)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getBodyMetrics(): Promise<BodyMetricsEntry[]> {
    if (!this.db) await this.init()

    const tx = this.db!.transaction(['bodyMetrics'], 'readonly')
    const store = tx.objectStore('bodyMetrics')

    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => resolve((request.result || []).sort((a, b) => a.date.localeCompare(b.date)))
      request.onerror = () => reject(request.error)
    })
  }
}

function hydrateStoredPlan(stored: StoredPlan | undefined): StoredPlan | undefined {
  if (!stored) {
    return undefined
  }

  const hydratedPlan = hydrateTrainingPlanDates(stored.plan) || stored.plan
  const hydratedOriginal = hydrateTrainingPlanDates(stored.originalPlan) || hydratedPlan

  return {
    ...stored,
    plan: hydratedPlan,
    originalPlan: hydratedOriginal,
  }
}

// Export singleton instance
export const storage = new StorageManager()
