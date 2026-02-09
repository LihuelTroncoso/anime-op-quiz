import { Hono } from 'hono'
import { constants } from 'node:fs'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { HttpError } from './domain/http-error'
import { generateRound, markOpeningListened } from './services/openings-game'
import { answerRound, beginRound, getRoomState, joinRoom, leaveRoom, markRoomActive, resetScores } from './services/room-store'

const app = new Hono()
const configuredPort = Number(process.env.PORT)
const serverPort = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : 8080
const serverHost = '0.0.0.0'

console.log(`[api] starting on ${serverHost}:${serverPort}`)
const webDistPath = resolve(process.cwd(), 'apps/web/dist')

const fileExists = async (path: string) => {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

const contentTypeFor = (path: string) => {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8'
  if (path.endsWith('.js')) return 'application/javascript; charset=utf-8'
  if (path.endsWith('.css')) return 'text/css; charset=utf-8'
  if (path.endsWith('.svg')) return 'image/svg+xml'
  if (path.endsWith('.json')) return 'application/json; charset=utf-8'
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  if (path.endsWith('.webp')) return 'image/webp'
  if (path.endsWith('.ico')) return 'image/x-icon'
  return 'application/octet-stream'
}

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

app.get('*', async (c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Not found' }, 404)
  }

  const requestedPath = c.req.path === '/' ? '/index.html' : c.req.path
  const candidatePath = resolve(webDistPath, `.${requestedPath}`)
  const safePath = candidatePath.startsWith(webDistPath) ? candidatePath : resolve(webDistPath, 'index.html')

  if (await fileExists(safePath)) {
    const file = await readFile(safePath)
    return new Response(file, {
      headers: {
        'Content-Type': contentTypeFor(safePath),
      },
    })
  }

  const fallbackIndex = resolve(webDistPath, 'index.html')
  if (await fileExists(fallbackIndex)) {
    const file = await readFile(fallbackIndex)
    return new Response(file, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  }

  return c.json({ error: 'Frontend build not found' }, 500)
})

export default {
  hostname: serverHost,
  port: serverPort,
  fetch: app.fetch,
}
