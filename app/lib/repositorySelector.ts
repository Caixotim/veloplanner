import { cloudRepository } from './cloudRepository'
import { localRepository } from './localRepository'
import { isCloudPersistenceEnabled } from './persistenceConfig'
import type { PlanRepository } from './repository'

/** Selects the repository only when explicitly enabled at build/deploy time. */
export function getPlanRepository(): PlanRepository {
  return isCloudPersistenceEnabled() ? cloudRepository : localRepository
}
