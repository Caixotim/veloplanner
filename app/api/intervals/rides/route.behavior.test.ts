import { POST } from './route'

type JsonBody = Record<string, unknown> | unknown[]

class TestResponse {
  static json(body: JsonBody, init: { status?: number } = {}) {
    return new TestResponse(body, init.status ?? 200)
  }

  readonly ok: boolean
  readonly statusText: string

  constructor(private readonly body: JsonBody, readonly status: number) {
    this.ok = status >= 200 && status < 300
    this.statusText = String(status)
  }

  async json(): Promise<JsonBody> {
    return this.body
  }

  async text(): Promise<string> {
    return JSON.stringify(this.body)
  }
}

describe('ride sync route behavior', () => {
  beforeEach(() => {
    Object.assign(globalThis, { Response: TestResponse })
  })

  it('normalizes stable activities, ignores activities without IDs, and returns a cursor', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new TestResponse([
        {
          id: 123,
          start_date_local: '2026-09-01T07:30:00',
          icu_training_load: 85.4,
          moving_time: 3600,
          distance: 42500,
          average_heartrate: 142,
        },
        {
          start_date_local: '2026-09-01T08:00:00',
        },
      ], 200)
    )
    global.fetch = fetchMock as typeof fetch

    const request = {
      json: async () => ({ since: 1_000 }),
      headers: new Headers({
        'x-intervals-api-key': 'test-key',
        'x-intervals-athlete-id': 'athlete-1',
      }),
    } as unknown as Request

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      newRidesCount: 1,
      rides: [
        {
          id: '123',
          trainingLoad: 85,
          duration: 60,
          distance: 42.5,
          avgHR: 142,
        },
      ],
    })
    expect(body.nextCursor).toBe(new Date('2026-09-01T07:30:00').getTime())
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/athlete/athlete-1/activities?oldest=')
    expect((options.headers as Headers).get('Authorization')).toBe(`Basic ${Buffer.from('API_KEY:test-key').toString('base64')}`)
  })

  it('returns a safe no-op response when credentials are missing', async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as typeof fetch

    const request = {
      json: async () => ({ since: 0 }),
      headers: new Headers(),
    } as unknown as Request

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ success: false, newRidesCount: 0, rides: [], changes: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
