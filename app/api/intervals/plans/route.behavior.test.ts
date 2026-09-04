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

function createPlan() {
  return {
    id: 'plan-route-test',
    userId: 'athlete-1',
    name: 'Route test plan',
    goal: 'endurance',
    durationWeeks: 1,
    startDate: new Date('2026-09-07T08:00:00.000Z'),
    endDate: new Date('2026-09-13T08:00:00.000Z'),
    weeks: [{
      weekNumber: 1,
      sessions: [{
        id: 'session-route-test',
        date: new Date('2026-09-08T08:00:00.000Z'),
        dayOfWeek: 2,
        type: 'endurance',
        duration: 60,
        intensity: 'moderate',
        description: 'Endurance ride',
        focus: ['Aerobic base'],
        equipment: ['indoor_trainer'],
      }],
    }],
  }
}

describe('plan sync route behavior', () => {
  beforeEach(() => {
    Object.assign(globalThis, { Response: TestResponse })
  })

  it('upserts a trainable session using a stable plan-scoped external ID', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(new TestResponse([], 200))
      .mockResolvedValueOnce(new TestResponse({ id: 77 }, 200))
    global.fetch = fetchMock as typeof fetch

    const request = {
      json: async () => ({ mode: 'upsert', plan: createPlan() }),
      headers: new Headers({
        'x-intervals-api-key': 'test-key',
        'x-intervals-athlete-id': 'athlete-1',
      }),
    } as unknown as Request

    const response = await POST(request)
    const body = await response.json()
    const [, postOptions] = fetchMock.mock.calls[1] as [string, RequestInit]
    const payload = JSON.parse(String(postOptions.body)) as Record<string, unknown>

    expect(body).toMatchObject({ success: true, syncedEvents: 1, syncedEventIds: [77] })
    expect(payload).toMatchObject({
      uid: 'plan-route-test:session-route-test',
      external_id: 'plan-route-test:session-route-test',
    })
  })

  it('refuses a new event when the target date is already at capacity', async () => {
    const fullDay = Array.from({ length: 5 }, (_, index) => ({
      external_id: `existing-${index}`,
      start_date_local: '2026-09-08T06:00:00',
    }))
    const fetchMock = jest.fn().mockResolvedValue(new TestResponse(fullDay, 200))
    global.fetch = fetchMock as typeof fetch

    const request = {
      json: async () => ({ mode: 'upsert', plan: createPlan() }),
      headers: new Headers({
        'x-intervals-api-key': 'test-key',
        'x-intervals-athlete-id': 'athlete-1',
      }),
    } as unknown as Request

    const response = await POST(request)
    const body = await response.json()

    expect(body).toMatchObject({
      success: false,
      failedSessions: 1,
      failedSessionIds: ['session-route-test'],
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
