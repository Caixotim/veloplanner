import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

function getKey(): Buffer {
  const secret = process.env.INTERVALS_TOKEN_ENCRYPTION_KEY
  if (!secret) throw new Error('INTERVALS_TOKEN_ENCRYPTION_KEY is not configured')
  return createHash('sha256').update(secret).digest()
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptSecret(value: string): string {
  const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'))
  if (!iv || !tag || !encrypted) throw new Error('Invalid encrypted secret')
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
