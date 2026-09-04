import { getPersistenceMode, isCloudPersistenceEnabled } from './persistenceConfig'

describe('persistence configuration', () => {
  const original = process.env.NEXT_PUBLIC_ENABLE_CLOUD_PERSISTENCE
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_ENABLE_CLOUD_PERSISTENCE
    else process.env.NEXT_PUBLIC_ENABLE_CLOUD_PERSISTENCE = original
  })

  it('defaults to local persistence', () => {
    delete process.env.NEXT_PUBLIC_ENABLE_CLOUD_PERSISTENCE
    expect(getPersistenceMode()).toBe('local')
    expect(isCloudPersistenceEnabled()).toBe(false)
  })

  it('enables cloud persistence only with an explicit true value', () => {
    process.env.NEXT_PUBLIC_ENABLE_CLOUD_PERSISTENCE = 'true'
    expect(getPersistenceMode()).toBe('cloud')
    expect(isCloudPersistenceEnabled()).toBe(true)
  })
})
