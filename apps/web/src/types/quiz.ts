import type { QuizOption } from '@anime-op-quiz/shared'

export type RequestStatus = 'idle' | 'loading' | 'ready' | 'error'

export type RoundDurationSeconds = 5 | 10 | 20

export type RoundPayload = {
  openingId: string
  audioUrl: string
  options: QuizOption[]
  roundDurationSeconds: RoundDurationSeconds
  roundEndsAt: number
}

export type ScoreEntry = {
  playerId: string
  name: string
  score: number
  correct: number
  attempted: number
}

export type RoomStateResponse = {
  round: RoundPayload | null
  hasAnswered: boolean
  roundResolved: boolean
  canPlayRoundAudio: boolean
  roundWinnerName: string | null
  canStartNextRound: boolean
  nextRoundOwnerName: string | null
  scoreboard: ScoreEntry[]
}

export const OPENING_START_SECONDS = 50
