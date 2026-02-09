import { Hono } from 'hono'
import { HttpError } from './domain/http-error'
import { generateRound, markOpeningListened } from './services/openings-game'
import { answerRound, beginRound, getRoomState, joinRoom, leaveRoom, markRoomActive, resetScores } from './services/room-store'

const app = new Hono()

app.use('*', async (c, next) => {
  markRoomActive()
  await next()
})

app.get('/api/health', (c) => c.json({ ok: true }))

app.post('/api/room/join', async (c) => {
  try {
    const payload = (await c.req.json()) as { name?: string; password?: string }
    const data = await joinRoom(payload.name ?? '', payload.password)
    return c.json(data)
  } catch (error) {
    if (error instanceof HttpError) {
      return c.json({ error: error.message }, { status: error.status as 400 | 401 | 404 | 409 })
    }
    return c.json({ error: 'Unable to join room' }, 500)
  }
})

app.get('/api/room/state', async (c) => {
  try {
    const data = await getRoomState(c.req.query('playerId'))
    return c.json(data)
  } catch (error) {
    if (error instanceof HttpError) {
      return c.json({ error: error.message }, { status: error.status as 400 | 401 | 404 | 409 })
    }
    return c.json({ error: 'Unable to load room state' }, 500)
  }
})

app.post('/api/room/next-round', async (c) => {
  try {
    const payload = (await c.req.json()) as { playerId?: string }
    if (!payload.playerId) {
      throw new HttpError(404, 'Player not found')
    }

    const round = await generateRound()
    const response = await beginRound(payload.playerId, round)
    return c.json(response)
  } catch (error) {
    if (error instanceof HttpError) {
      return c.json({ error: error.message }, { status: error.status as 400 | 401 | 404 | 409 })
    }
    return c.json({ error: 'Unable to start next round' }, 500)
  }
})

app.post('/api/room/answer', async (c) => {
  try {
    const payload = (await c.req.json()) as { playerId?: string; answerTitle?: string }
    if (!payload.playerId) {
      throw new HttpError(404, 'Player not found')
    }

    const result = await answerRound(payload.playerId, payload.answerTitle ?? '')
    await markOpeningListened(result.openingId)

    return c.json({
      correct: result.correct,
      correctOpeningTitle: result.correctOpeningTitle,
      scoreboard: result.scoreboard,
    })
  } catch (error) {
    if (error instanceof HttpError) {
      return c.json({ error: error.message }, { status: error.status as 400 | 401 | 404 | 409 })
    }
    return c.json({ error: 'Unable to submit answer' }, 500)
  }
})

app.post('/api/room/reset-scores', async (c) => {
  try {
    const payload = (await c.req.json()) as { playerId?: string }
    if (!payload.playerId) {
      throw new HttpError(404, 'Player not found')
    }

    const scoreboard = await resetScores(payload.playerId)
    return c.json({ ok: true, scoreboard })
  } catch (error) {
    if (error instanceof HttpError) {
      return c.json({ error: error.message }, { status: error.status as 400 | 401 | 404 | 409 })
    }
    return c.json({ error: 'Unable to reset scores' }, 500)
  }
})

app.post('/api/room/leave', async (c) => {
  try {
    const payload = (await c.req.json()) as { playerId?: string }
    if (!payload.playerId) {
      throw new HttpError(404, 'Player not found')
    }

    await leaveRoom(payload.playerId)
    return c.json({ ok: true })
  } catch (error) {
    if (error instanceof HttpError) {
      return c.json({ error: error.message }, { status: error.status as 400 | 401 | 404 | 409 })
    }
    return c.json({ error: 'Unable to leave room' }, 500)
  }
})

export default {
  hostname: '127.0.0.1',
  port: 8787,
  fetch: app.fetch,
}
