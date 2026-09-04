import { decryptSecret, encryptSecret } from './serverSecret'

describe('server secret encryption', () => {
  const original = process.env.INTERVALS_TOKEN_ENCRYPTION_KEY
  afterEach(() => {
    if (original === undefined) delete process.env.INTERVALS_TOKEN_ENCRYPTION_KEY
    else process.env.INTERVALS_TOKEN_ENCRYPTION_KEY = original
  })

  it('round trips tokens without exposing plaintext in the ciphertext', () => {
    process.env.INTERVALS_TOKEN_ENCRYPTION_KEY = 'test-only-key'
    const encrypted = encryptSecret('intervals-access-token')
    expect(encrypted).not.toContain('intervals-access-token')
    expect(decryptSecret(encrypted)).toBe('intervals-access-token')
  })
})
