import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_QUESTION_LENGTH = 500

export async function POST(request: Request) {
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
  const ollamaModel = process.env.OLLAMA_MODEL || 'qwen3:4b'

  try {
    const body = (await request.json()) as {
      question?: unknown
      context?: unknown
      history?: unknown
      locale?: unknown
    }
    const question = typeof body.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION_LENGTH) : ''
    if (!question) {
      return NextResponse.json({ error: 'A coaching question is required' }, { status: 400 })
    }

    const locale = body.locale === 'pt-PT' || (body.context && typeof body.context === 'object' && (body.context as { locale?: unknown }).locale === 'pt-PT') ? 'pt-PT' : 'en'
    const context = body.context && typeof body.context === 'object' ? JSON.stringify(body.context).slice(0, 4000) : '{}'
    const history = Array.isArray(body.history)
      ? body.history
        .filter((entry): entry is { role: 'user' | 'assistant'; content: string } => (
          Boolean(entry) && typeof entry === 'object' &&
          ((entry as { role?: unknown }).role === 'user' || (entry as { role?: unknown }).role === 'assistant') &&
          typeof (entry as { content?: unknown }).content === 'string'
        ))
        .slice(-8)
        .map((entry) => ({ role: entry.role, content: entry.content.slice(0, 800) }))
      : []
    const systemPrompt = `You are a cautious cycling coach. The required output language is ${locale === 'pt-PT' ? 'European Portuguese from Portugal; never English or Brazilian Portuguese' : 'English'}. Every word, heading, and label must use that language. Condense the answer into at most 4 short bullets or 2 brief paragraphs, no more than 80 words total. Include key dates, durations, and safety caveats. Base it only on the supplied context. Never return JSON, YAML, field lists, or configuration objects. Never diagnose injuries, prescribe unsafe intensity, or silently change a training plan. For fatigue, pain, illness, or concerning symptoms, recommend rest and professional medical advice. Explain that plan changes require athlete confirmation. Return plain text only.`
    const endpoint = `${ollamaBaseUrl.replace(/\/$/, '')}/api/chat`
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: `Athlete and training context:\n${context}\n\nQuestion:\n${question}` },
    ]
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ollamaModel, stream: false, options: { temperature: 0.2, num_predict: 140 }, messages }),
      signal: AbortSignal.timeout(25_000),
    })

    if (!response.ok) {
      console.warn('AI coach provider request failed', response.status)
      return NextResponse.json({ error: 'AI coaching is temporarily unavailable' }, { status: 502 })
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }>; message?: { content?: unknown } }
    const answer = payload.message?.content
    if (typeof answer !== 'string' || !answer.trim()) {
      return NextResponse.json({ error: 'AI coach returned no guidance' }, { status: 502 })
    }

    return NextResponse.json({ answer: answer.trim().slice(0, 700), provider: 'ollama' })
  } catch (error) {
    console.error('AI coach request failed', error)
    return NextResponse.json({ error: 'Unable to reach the AI coach' }, { status: 502 })
  }
}
