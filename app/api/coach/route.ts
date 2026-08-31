import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_QUESTION_LENGTH = 500

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2:3b'
  const useOllama = !apiKey && Boolean(process.env.OLLAMA_MODEL || process.env.OLLAMA_BASE_URL)
  if (!apiKey && !useOllama) {
    return NextResponse.json({ error: 'AI coaching is not configured' }, { status: 503 })
  }

  try {
    const body = (await request.json()) as {
      question?: unknown
      context?: unknown
    }
    const question = typeof body.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION_LENGTH) : ''
    if (!question) {
      return NextResponse.json({ error: 'A coaching question is required' }, { status: 400 })
    }

    const context = body.context && typeof body.context === 'object' ? JSON.stringify(body.context).slice(0, 4000) : '{}'
    const systemPrompt = 'You are a cautious cycling coach. Give concise, practical guidance based only on the supplied athlete, plan, and training-data context. Never diagnose injuries, prescribe unsafe intensity, or silently change a training plan. For fatigue, pain, illness, or concerning symptoms, recommend rest and professional medical advice. Explain that plan changes require athlete confirmation. Return plain text only.'
    const userPrompt = `Athlete and training context:\n${context}\n\nQuestion:\n${question}`
    const endpoint = useOllama
      ? `${ollamaBaseUrl.replace(/\/$/, '')}/api/chat`
      : process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions'
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(useOllama
        ? { model: ollamaModel, stream: false, options: { temperature: 0.2, num_predict: 220 }, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] }
        : { model: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.2, max_tokens: 220, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] }),
      signal: AbortSignal.timeout(25_000),
    })

    if (!response.ok) {
      console.warn('AI coach provider request failed', response.status)
      return NextResponse.json({ error: 'AI coaching is temporarily unavailable' }, { status: 502 })
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }>; message?: { content?: unknown } }
    const answer = useOllama ? payload.message?.content : payload.choices?.[0]?.message?.content
    if (typeof answer !== 'string' || !answer.trim()) {
      return NextResponse.json({ error: 'AI coach returned no guidance' }, { status: 502 })
    }

    return NextResponse.json({ answer: answer.trim().slice(0, 1200), provider: useOllama ? 'ollama' : 'openai' })
  } catch (error) {
    console.error('AI coach request failed', error)
    return NextResponse.json({ error: 'Unable to reach the AI coach' }, { status: 502 })
  }
}
