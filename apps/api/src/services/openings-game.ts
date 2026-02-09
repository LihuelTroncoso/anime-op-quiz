import type { QuizOption } from '@anime-op-quiz/shared'
import { HttpError } from '../domain/http-error'
import { openingSource } from '../sources/opening-source'

export type GeneratedRound = {
  openingId: string
  audioUrl: string
  options: QuizOption[]
  correctOpeningTitle: string
}

const pickRandom = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)]

export const generateRound = async (): Promise<GeneratedRound> => {
  const openings = await openingSource.getAllOpenings()

  if (openings.length === 0) {
    throw new HttpError(404, 'No openings available')
  }

  const chosenOpening = pickRandom(openings)
  const options = openings
    .map((opening) => ({
      id: opening.id,
      title: opening.openingTitle,
    }))
    .sort(() => Math.random() - 0.5)

  return {
    openingId: chosenOpening.id,
    audioUrl: chosenOpening.audioUrl,
    options,
    correctOpeningTitle: chosenOpening.openingTitle,
  }
}

export const markOpeningListened = async (openingId: string) => {
  await openingSource.markAsListened(openingId)
}
