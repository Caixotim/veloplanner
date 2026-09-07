export type PersistenceMode = 'local' | 'cloud'

/** Authenticated deployments use Supabase persistence whenever its public config exists. */
export function getPersistenceMode(): PersistenceMode {
  const explicitlyEnabled = process.env.NEXT_PUBLIC_ENABLE_CLOUD_PERSISTENCE === 'true'
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  return explicitlyEnabled || supabaseConfigured ? 'cloud' : 'local'
}

export function isCloudPersistenceEnabled(): boolean {
  return getPersistenceMode() === 'cloud'
}
