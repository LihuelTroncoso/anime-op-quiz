import { Hono } from 'hono'
import type { QuizRound } from '@anime-op-quiz/shared'
import { openingSource } from './opening-source'
import { chown } from 'node:fs'

const app = new Hono()

const pickRandom = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)]

app.get('/api/health', (c) => c.json({ ok: true }))

app.get('/api/openings/random', async (c) => {
  const openings = await openingSource.getAllOpenings()

  if (openings.length === 0) {
    return c.json({ error: 'No openings available' }, 404)
  }

  let chosenOpening = pickRandom(openings)
  while(chosenOpening.listened) {
    chosenOpening = pickRandom(openings)
  }
  const options = openings
    .map((opening) => ({
      id: opening.id,
      title: opening.openingTitle,
    }))
    .sort(() => Math.random() - 0.5)

  const response: QuizRound = {
    openingId: chosenOpening.id,
    audioUrl: chosenOpening.audioUrl,
    options,
    correctOpeningTitle: chosenOpening.openingTitle,
  }

  return c.json(response)
})

app.post('/api/openings/:id/listened', async (c) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ error: 'Missing opening id' }, 400)
  }

  await openingSource.markAsListened(id)
  return c.json({ ok: true })
})

export default {
  port: 8787,
  fetch: app.fetch,
}
