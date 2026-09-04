import { getPlanRepository } from './repositorySelector'
import { localRepository } from './localRepository'
import { cloudRepository } from './cloudRepository'

describe('getPlanRepository', () => {
  const original = process.env.NEXT_PUBLIC_ENABLE_CLOUD_PERSISTENCE
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_ENABLE_CLOUD_PERSISTENCE
    else process.env.NEXT_PUBLIC_ENABLE_CLOUD_PERSISTENCE = original
  })

  it('selects local persistence by default', () => {
    delete process.env.NEXT_PUBLIC_ENABLE_CLOUD_PERSISTENCE
    expect(getPlanRepository()).toBe(localRepository)
  })

  it('selects cloud persistence only when enabled', () => {
    process.env.NEXT_PUBLIC_ENABLE_CLOUD_PERSISTENCE = 'true'
    expect(getPlanRepository()).toBe(cloudRepository)
  })
})
