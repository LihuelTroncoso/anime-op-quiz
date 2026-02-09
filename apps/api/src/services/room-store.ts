import type { QuizOption } from '@anime-op-quiz/shared'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { HttpError } from '../domain/http-error'
import { resetAllOpeningsAsUnlistened } from './openings-game'

export const ROOM_ID = 'main-room'

type Player = {
  id: string
  name: string
  score: number
  correct: number
  attempted: number
}

type RoomRound = {
  openingId: string
  audioUrl: string
  options: QuizOption[]
  correctOpeningTitle: string
  roundDurationSeconds: 5 | 10 | 20
  roundStartedAt: number
  participantPlayerIds: Set<string>
  answeredPlayerIds: Set<string>
  nextRoundWinnerPlayerId: string | null
}

const allowedRoundDurations = new Set([5, 10, 20])

const roomPassword = process.env.ROOM_PASSWORD?.trim()
const idleTimeoutMs = Number(process.env.ROOM_IDLE_MINUTES ?? '20') * 60 * 1000

const roomState: {
  players: Map<string, Player>
  currentRound: RoomRound | null
  roundNumber: number
  nextRoundOwnerPlayerId: string | null
} = {
  players: new Map(),
  currentRound: null,
  roundNumber: 0,
  nextRoundOwnerPlayerId: null,
}

const pickRandom = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)]

const ensureNextRoundOwner = () => {
  if (roomState.nextRoundOwnerPlayerId && roomState.players.has(roomState.nextRoundOwnerPlayerId)) {
    return roomState.nextRoundOwnerPlayerId
  }

  const playerIds = [...roomState.players.keys()]
  if (playerIds.length === 0) {
    roomState.nextRoundOwnerPlayerId = null
    return null
  }

  const ownerPlayerId = pickRandom(playerIds)
  roomState.nextRoundOwnerPlayerId = ownerPlayerId
  return ownerPlayerId
}

const isRoundExpired = (round: RoomRound) => Date.now() >= round.roundStartedAt + round.roundDurationSeconds * 1000

const isRoundResolved = (round: RoomRound) =>
  Boolean(round.nextRoundWinnerPlayerId) || round.answeredPlayerIds.size >= round.participantPlayerIds.size || isRoundExpired(round)

const resolveRoundDuration = (value?: number) => {
  if (value === undefined) {
    return 10 as 5 | 10 | 20
  }

  if (!allowedRoundDurations.has(value)) {
    throw new HttpError(400, 'Round duration must be one of: 5, 10, 20 seconds')
  }

  return value as 5 | 10 | 20
}

let lastRequestAt = Date.now()

const playersCsvPath = () =>
  process.env.PLAYERS_SCORE_CSV?.trim()
    ? resolve(process.env.PLAYERS_SCORE_CSV.trim())
    : resolve(process.cwd(), 'data', 'players-score.csv')

const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`

const parseCsvLine = (line: string) => {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      fields.push(current)
      current = ''
      continue
    }

    current += char
  }

  fields.push(current)
  return fields
}

const readPlayers = async () => {
  try {
    const content = await readFile(playersCsvPath(), 'utf-8')
    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    if (lines.length <= 1) {
      return [] as Player[]
    }

    const headers = parseCsvLine(lines[0])
    const idIndex = headers.indexOf('id')
    const nameIndex = headers.indexOf('name')
    const scoreIndex = headers.indexOf('score')
    const correctIndex = headers.indexOf('correct')
    const attemptedIndex = headers.indexOf('attempted')

    if (idIndex < 0 || nameIndex < 0 || scoreIndex < 0 || correctIndex < 0 || attemptedIndex < 0) {
      return [] as Player[]
    }

    return lines.slice(1).map((line) => {
      const values = parseCsvLine(line)
      return {
        id: values[idIndex] ?? '',
        name: values[nameIndex] ?? '',
        score: Number(values[scoreIndex] ?? '0') || 0,
        correct: Number(values[correctIndex] ?? '0') || 0,
        attempted: Number(values[attemptedIndex] ?? '0') || 0,
      }
    })
  } catch {
    return [] as Player[]
  }
}

const writePlayers = async (players: Player[]) => {
  const filePath = playersCsvPath()
  await mkdir(dirname(filePath), { recursive: true })

  const header = ['id', 'name', 'score', 'correct', 'attempted'].join(',')
  const body = players
    .map((player) => [player.id, player.name, String(player.score), String(player.correct), String(player.attempted)].map(csvEscape).join(','))
    .join('\n')

  await writeFile(filePath, `${header}\n${body}\n`, 'utf-8')
}

const upsertPlayer = async (player: Player) => {
  const players = await readPlayers()
  const index = players.findIndex((row) => row.id === player.id)
  if (index >= 0) {
    players[index] = player
  } else {
    players.push(player)
  }

  await writePlayers(players)
}

const clearAllPlayers = async () => {
  console.log('Clearing all players')
  roomState.players.clear()
  roomState.nextRoundOwnerPlayerId = null
  if (roomState.currentRound) {
    roomState.currentRound.participantPlayerIds.clear()
    roomState.currentRound.answeredPlayerIds.clear()
    roomState.currentRound.nextRoundWinnerPlayerId = null
  }
  await resetAllOpeningsAsUnlistened()
  await writePlayers([])
}

setInterval(() => {
  const idleFor = Date.now() - lastRequestAt
  if (idleFor < idleTimeoutMs) {
    return
  }

  void clearAllPlayers()
  lastRequestAt = Date.now()
}, 60 * 1000)

export const markRoomActive = () => {
  lastRequestAt = Date.now()
}

const resolvePlayer = async (playerId: string) => {
  const active = roomState.players.get(playerId)
  if (active) {
    return active
  }

  const persisted = (await readPlayers()).find((player) => player.id === playerId)
  if (!persisted) {
    return null
  }

  roomState.players.set(playerId, persisted)
  return persisted
}

export const joinRoom = async (name: string, password?: string) => {
  if (!name.trim()) {
    throw new HttpError(400, 'Name is required')
  }

  if (roomPassword && password?.trim() !== roomPassword) {
    throw new HttpError(401, 'Invalid room password')
  }

  const playerId = crypto.randomUUID()
  const player: Player = {
    id: playerId,
    name: name.trim(),
    score: 0,
    correct: 0,
    attempted: 0,
  }

  roomState.players.set(playerId, player)
  roomState.nextRoundOwnerPlayerId = playerId
  await upsertPlayer(player)

  return { roomId: ROOM_ID, playerId, name: player.name }
}

export const getScoreboard = async () =>
  (await readPlayers())
    .map((player) => ({
      playerId: player.id,
      name: player.name,
      score: player.score,
      correct: player.correct,
      attempted: player.attempted,
    }))
    .sort((a, b) => b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name))

export const getRoomState = async (playerId?: string) => {
  if (playerId && !(await resolvePlayer(playerId))) {
    throw new HttpError(404, 'Player not found')
  }

  const nextRoundOwnerPlayerId = ensureNextRoundOwner()
  const scoreboard = await getScoreboard()
  const roundWinnerPlayerId = roomState.currentRound?.nextRoundWinnerPlayerId ?? null
  const roundResolved = roomState.currentRound ? isRoundResolved(roomState.currentRound) : true
  const nextRoundOwnerName = nextRoundOwnerPlayerId
    ? (scoreboard.find((entry) => entry.playerId === nextRoundOwnerPlayerId)?.name ?? null)
    : null
  const roundWinnerName = roundWinnerPlayerId
    ? (scoreboard.find((entry) => entry.playerId === roundWinnerPlayerId)?.name ?? null)
    : null

  return {
    roomId: ROOM_ID,
    roundNumber: roomState.roundNumber,
    round: roomState.currentRound
      ? {
          openingId: roomState.currentRound.openingId,
          audioUrl: roomState.currentRound.audioUrl,
          options: roomState.currentRound.options,
          roundDurationSeconds: roomState.currentRound.roundDurationSeconds,
          roundEndsAt: roomState.currentRound.roundStartedAt + roomState.currentRound.roundDurationSeconds * 1000,
        }
      : null,
    hasAnswered:
      Boolean(playerId) && roomState.currentRound ? roomState.currentRound.answeredPlayerIds.has(playerId as string) : false,
    roundResolved,
    roundWinnerName,
    canStartNextRound: Boolean(playerId) && playerId === nextRoundOwnerPlayerId && roundResolved,
    nextRoundOwnerName,
    scoreboard,
  }
}

export const beginRound = async (
  playerId: string,
  round: Omit<
    RoomRound,
    | 'roundDurationSeconds'
    | 'roundStartedAt'
    | 'participantPlayerIds'
    | 'answeredPlayerIds'
    | 'nextRoundWinnerPlayerId'
  >,
  requestedRoundDurationSeconds?: number,
) => {
  if (!(await resolvePlayer(playerId))) {
    throw new HttpError(404, 'Player not found')
  }

  const nextRoundOwnerPlayerId = ensureNextRoundOwner()
  if (!nextRoundOwnerPlayerId) {
    throw new HttpError(409, 'No players available to choose the next opening')
  }

  if (nextRoundOwnerPlayerId !== playerId) {
    throw new HttpError(409, 'Only the selected player can start the next opening')
  }

  if (roomState.currentRound && !isRoundResolved(roomState.currentRound)) {
    throw new HttpError(409, 'Current opening is still active')
  }

  const participantPlayerIds = new Set(roomState.players.keys())
  if (participantPlayerIds.size === 0) {
    throw new HttpError(409, 'No players available to start a round')
  }

  const roundDurationSeconds = resolveRoundDuration(requestedRoundDurationSeconds)

  roomState.currentRound = {
    ...round,
    roundDurationSeconds,
    roundStartedAt: Date.now(),
    participantPlayerIds,
    answeredPlayerIds: new Set(),
    nextRoundWinnerPlayerId: null,
  }
  roomState.roundNumber += 1

  return {
    roundNumber: roomState.roundNumber,
    round: {
      openingId: roomState.currentRound.openingId,
      audioUrl: roomState.currentRound.audioUrl,
      options: roomState.currentRound.options,
    },
  }
}

export const answerRound = async (playerId: string, answerTitle: string) => {
  if (!playerId) {
    throw new HttpError(404, 'Player not found')
  }

  const player = await resolvePlayer(playerId)
  if (!player) {
    throw new HttpError(404, 'Player not found')
  }

  if (!roomState.currentRound) {
    throw new HttpError(400, 'No active round')
  }

  if (!roomState.currentRound.participantPlayerIds.has(playerId)) {
    throw new HttpError(409, 'You joined after this opening started. Wait for the next one')
  }

  if (isRoundExpired(roomState.currentRound)) {
    throw new HttpError(409, 'Time is up for this opening')
  }

  if (isRoundResolved(roomState.currentRound)) {
    throw new HttpError(409, 'Opening already solved. Wait for the next one')
  }

  if (!answerTitle.trim()) {
    throw new HttpError(400, 'Answer title is required')
  }

  if (roomState.currentRound.answeredPlayerIds.has(playerId)) {
    throw new HttpError(409, 'Player already answered this round')
  }

  const isCorrect = answerTitle.trim() === roomState.currentRound.correctOpeningTitle
  player.attempted += 1
  if (isCorrect) {
    player.correct += 1
    player.score += 1
    if (!roomState.currentRound.nextRoundWinnerPlayerId) {
      roomState.currentRound.nextRoundWinnerPlayerId = playerId
      roomState.nextRoundOwnerPlayerId = playerId
    }
  }

  await upsertPlayer(player)
  roomState.currentRound.answeredPlayerIds.add(playerId)

  return {
    correct: isCorrect,
    correctOpeningTitle: roomState.currentRound.correctOpeningTitle,
    openingId: roomState.currentRound.openingId,
    scoreboard: await getScoreboard(),
  }
}

export const resetScores = async (playerId: string) => {
  if (!(await resolvePlayer(playerId))) {
    throw new HttpError(404, 'Player not found')
  }

  const persistedPlayers = await readPlayers()
  const resetPlayers = persistedPlayers.map((player) => ({
    ...player,
    score: 0,
    correct: 0,
    attempted: 0,
  }))
  await writePlayers(resetPlayers)

  for (const [id, player] of roomState.players) {
    roomState.players.set(id, {
      ...player,
      score: 0,
      correct: 0,
      attempted: 0,
    })
  }

  return await getScoreboard()
}

export const leaveRoom = async (playerId: string) => {
  if (!playerId) {
    throw new HttpError(404, 'Player not found')
  }

  roomState.players.delete(playerId)

  const persistedPlayers = await readPlayers()
  const nextPlayers = persistedPlayers.filter((player) => player.id !== playerId)
  await writePlayers(nextPlayers)

  if (roomState.currentRound?.answeredPlayerIds.has(playerId)) {
    roomState.currentRound.answeredPlayerIds.delete(playerId)
  }

  if (roomState.currentRound?.participantPlayerIds.has(playerId)) {
    roomState.currentRound.participantPlayerIds.delete(playerId)
  }

  if (roomState.currentRound?.nextRoundWinnerPlayerId === playerId) {
    roomState.currentRound.nextRoundWinnerPlayerId = null
  }

  if (roomState.nextRoundOwnerPlayerId === playerId) {
    roomState.nextRoundOwnerPlayerId = null
    ensureNextRoundOwner()
  }
}
