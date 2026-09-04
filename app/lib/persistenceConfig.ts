export type PersistenceMode = 'local' | 'cloud'

/** Cloud writes stay opt-in until Supabase is configured and migration is verified. */
export function getPersistenceMode(): PersistenceMode {
  return process.env.NEXT_PUBLIC_ENABLE_CLOUD_PERSISTENCE === 'true' ? 'cloud' : 'local'
}

export function isCloudPersistenceEnabled(): boolean {
  return getPersistenceMode() === 'cloud'
}
