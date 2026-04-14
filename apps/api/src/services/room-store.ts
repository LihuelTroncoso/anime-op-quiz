import type { QuizOption } from "@anime-op-quiz/shared";
import HistoryUserDao from "../dao/history.users.dao";
import { HttpError } from "../domain/http-error";
import PlayerCache from "../redis/player.cache";
import { resetAllOpeningsAsUnlistened } from "./openings-game";

export const ROOM_ID = "main-room";

export type clearPlayersPlayer = {
  id: number;
  name: string;
  score: number;
  correct: number;
  attempted: number;
};

type RoomRound = {
  openingId: string;
  audioUrl: string;
  options: QuizOption[];
  correctOpeningTitle: string;
  roundDurationSeconds: 5 | 10 | 20;
  roundStartedAt: number;
  participantPlayerIds: Set<number>;
  answeredPlayerIds: Set<number>;
  nextRoundWinnerPlayerId: number | null;
};

const userDao = new HistoryUserDao();
const playerCache = new PlayerCache();
const allowedRoundDurations = new Set([5, 10, 20]);

const roomPassword = process.env.ROOM_PASSWORD?.trim();
const idleTimeoutMs = Number(process.env.ROOM_IDLE_MINUTES ?? "20") * 60 * 1000;

const roomState: {
  currentRound: RoomRound | null;
  roundNumber: number;
  nextRoundOwnerPlayerId: number | null;
} = {
  currentRound: null,
  roundNumber: 0,
  nextRoundOwnerPlayerId: null,
};

const ensureNextRoundOwner = async () => {
  if (
    roomState.nextRoundOwnerPlayerId &&
    (await playerCache.playerExists(roomState.nextRoundOwnerPlayerId)) !== null
  ) {
    return roomState.nextRoundOwnerPlayerId;
  }

  if (await playerCache.playersIsEmpty()) {
    roomState.nextRoundOwnerPlayerId = null;
    return null;
  }

  const ownerPlayerId = await playerCache.pickRandomPlayer();
  roomState.nextRoundOwnerPlayerId = ownerPlayerId;
  return ownerPlayerId;
};

const isRoundExpired = (round: RoomRound) =>
  Date.now() >= round.roundStartedAt + round.roundDurationSeconds * 1000;

const isRoundResolved = (round: RoomRound) =>
  Boolean(round.nextRoundWinnerPlayerId) ||
  round.answeredPlayerIds.size >= round.participantPlayerIds.size ||
  isRoundExpired(round);

const resolveRoundDuration = (value?: number) => {
  if (value === undefined) {
    return 10 as 5 | 10 | 20;
  }

  if (!allowedRoundDurations.has(value)) {
    throw new HttpError(
      400,
      "Round duration must be one of: 5, 10, 20 seconds",
    );
  }

  return value as 5 | 10 | 20;
};

let lastRequestAt = Date.now();

const createPlayer = async (name: string) => {
  const user = await userDao.createUser(name);

  if (user) {
    const player = { ...user, correct: 0, attempted: 0 };
    playerCache.storePlayer(player);
  }

  return user;
};

const clearAllPlayers = async () => {
  console.log("Clearing all players");
  roomState.nextRoundOwnerPlayerId = null;
  if (roomState.currentRound) {
    roomState.currentRound.participantPlayerIds.clear();
    roomState.currentRound.answeredPlayerIds.clear();
    roomState.currentRound.nextRoundWinnerPlayerId = null;
  }
  await playerCache.clearPlayers();
  await resetAllOpeningsAsUnlistened();
  // await writePlayers([]);
};

setInterval(() => {
  const idleFor = Date.now() - lastRequestAt;
  if (idleFor < idleTimeoutMs) {
    return;
  }

  void clearAllPlayers();
  lastRequestAt = Date.now();
}, 60 * 1000);

export const markRoomActive = () => {
  lastRequestAt = Date.now();
};

const resolvePlayer = async (playerId: number) => {
  // TODO: Revisar findUser
  const active = await playerCache.findPlayer(playerId);
  if (active) {
    return active;
  }

  const persisted = userDao.findUser(playerId);
  const player = await persisted.then((user) => {
    if (user) {
      const player = {
        ...user,
        correct: 0,
        attempted: 0,
      };
      // TODO: revisar storePlayer
      playerCache.storePlayer(player);
      return player;
    } else {
      throw new HttpError(500, `User does not exists ${playerId}`);
    }
  });

  return player;
};

export const joinRoom = async (name: string, password?: string) => {
  if (!name.trim()) {
    throw new HttpError(400, "Name is required");
  }

  if (roomPassword && password?.trim() !== roomPassword) {
    throw new HttpError(401, "Invalid room password");
  }

  const user = await createPlayer(name);

  if (user) {
    const playerId = user.id;
    roomState.nextRoundOwnerPlayerId = playerId;
    return { roomId: ROOM_ID, playerId, name };
  } else {
    throw new HttpError(500, "Error while creating user");
  }
};

export const getScoreboard = async () => {
  const players = await playerCache.getAllPlayers();
  players.sort(
    (a, b) =>
      b.score - a.score ||
      b.correct - a.correct ||
      a.name.localeCompare(b.name),
  );
  return players;
};

export const getRoomState = async (playerId?: number) => {
  if (playerId && !(await resolvePlayer(playerId))) {
    throw new HttpError(404, "Player not found");
  }

  const nextRoundOwnerPlayerId = await ensureNextRoundOwner();
  const scoreboard = await getScoreboard();
  const roundWinnerPlayerId =
    roomState.currentRound?.nextRoundWinnerPlayerId ?? null;
  const roundResolved = roomState.currentRound
    ? isRoundResolved(roomState.currentRound)
    : true;
  const nextRoundOwnerName = nextRoundOwnerPlayerId
    ? (playerCache.findPlayerName(nextRoundOwnerPlayerId) ?? null)
    : null;
  const roundWinnerName = roundWinnerPlayerId
    ? (playerCache.findPlayerName(roundWinnerPlayerId) ?? null)
    : null;

  return {
    roomId: ROOM_ID,
    roundNumber: roomState.roundNumber,
    round: roomState.currentRound
      ? {
        openingId: roomState.currentRound.openingId,
        audioUrl: roomState.currentRound.audioUrl,
        options: roomState.currentRound.options,
        roundDurationSeconds: roomState.currentRound.roundDurationSeconds,
        roundEndsAt:
          roomState.currentRound.roundStartedAt +
          roomState.currentRound.roundDurationSeconds * 1000,
      }
      : null,
    hasAnswered:
      Boolean(playerId) && roomState.currentRound
        ? roomState.currentRound.answeredPlayerIds.has(playerId ? playerId : -1)
        : false,
    roundResolved,
    roundWinnerName,
    canStartNextRound:
      Boolean(playerId) && playerId === nextRoundOwnerPlayerId && roundResolved,
    nextRoundOwnerName,
    scoreboard,
  };
};

export const beginRound = async (
  playerId: number,
  round: Omit<
    RoomRound,
    | "roundDurationSeconds"
    | "roundStartedAt"
    | "participantPlayerIds"
    | "answeredPlayerIds"
    | "nextRoundWinnerPlayerId"
  >,
  requestedRoundDurationSeconds?: number,
) => {
  if (!(await resolvePlayer(playerId))) {
    throw new HttpError(404, "Player not found");
  }

  const nextRoundOwnerPlayerId = await ensureNextRoundOwner();
  if (!nextRoundOwnerPlayerId) {
    throw new HttpError(409, "No players available to choose the next opening");
  }

  if (nextRoundOwnerPlayerId !== playerId) {
    throw new HttpError(
      409,
      "Only the selected player can start the next opening",
    );
  }

  if (roomState.currentRound && !isRoundResolved(roomState.currentRound)) {
    throw new HttpError(409, "Current opening is still active");
  }

  const participantPlayerIds = await playerCache.totalPlayers();
  if (participantPlayerIds.size === 0) {
    throw new HttpError(409, "No players available to start a round");
  }

  const roundDurationSeconds = resolveRoundDuration(
    requestedRoundDurationSeconds,
  );

  roomState.currentRound = {
    ...round,
    roundDurationSeconds,
    roundStartedAt: Date.now(),
    participantPlayerIds,
    answeredPlayerIds: new Set(),
    nextRoundWinnerPlayerId: null,
  };
  roomState.roundNumber += 1;

  return {
    roundNumber: roomState.roundNumber,
    round: {
      openingId: roomState.currentRound.openingId,
      audioUrl: roomState.currentRound.audioUrl,
      options: roomState.currentRound.options,
    },
  };
};

export const answerRound = async (playerId: number, answerTitle: string) => {
  if (!playerId) {
    throw new HttpError(404, "Player not found");
  }

  const player = await resolvePlayer(playerId);
  if (!player) {
    throw new HttpError(404, "Player not found");
  }

  if (!roomState.currentRound) {
    throw new HttpError(400, "No active round");
  }

  if (!roomState.currentRound.participantPlayerIds.has(playerId)) {
    throw new HttpError(
      409,
      "You joined after this opening started. Wait for the next one",
    );
  }

  if (isRoundExpired(roomState.currentRound)) {
    throw new HttpError(409, "Time is up for this opening");
  }

  if (isRoundResolved(roomState.currentRound)) {
    throw new HttpError(409, "Opening already solved. Wait for the next one");
  }

  if (!answerTitle.trim()) {
    throw new HttpError(400, "Answer title is required");
  }

  if (roomState.currentRound.answeredPlayerIds.has(playerId)) {
    throw new HttpError(409, "Player already answered this round");
  }

  if (!player) {
    throw new HttpError(
      500,
      "Unexpected error when trying to update user score",
    );
  }
  const isCorrect =
    answerTitle.trim() === roomState.currentRound.correctOpeningTitle;
  if (isCorrect) {
    player.correct += 1;
    player.score += 1;
    if (!roomState.currentRound.nextRoundWinnerPlayerId) {
      roomState.currentRound.nextRoundWinnerPlayerId = playerId;
      roomState.nextRoundOwnerPlayerId = playerId;
    }
  }

  await userDao.updateUserScore(player.id, player.score);
  roomState.currentRound.answeredPlayerIds.add(playerId);

  return {
    correct: isCorrect,
    correctOpeningTitle: roomState.currentRound.correctOpeningTitle,
    openingId: roomState.currentRound.openingId,
    scoreboard: await getScoreboard(),
  };
};

export const resetScores = async (playerId: number) => {
  if (!(await resolvePlayer(playerId))) {
    throw new HttpError(404, "Player not found");
  }
  //
  // const persistedPlayers = await readPlayers();
  //   const resetPlayers = persistedPlayers.map((player) => ({
  //     ...player,
  //     score: 0,
  //     correct: 0,
  //     attempted: 0,
  //   }));
  //   // await writePlayers(resetPlayers);
  //
  await Promise.all([userDao.resetScores(), playerCache.resetAllScores()]);
  return await getScoreboard();
};

export const leaveRoom = async (playerId: number) => {
  if (!playerId) {
    throw new HttpError(404, "Player not found");
  }

  playerCache.deletePlayer(playerId);

  // const persistedPlayers = await readPlayers();
  // const nextPlayers = persistedPlayers.filter(
  // 	(player) => player.id !== playerId,
  // );
  // await writePlayers(nextPlayers);

  if (roomState.currentRound?.answeredPlayerIds.has(playerId)) {
    roomState.currentRound.answeredPlayerIds.delete(playerId);
  }

  if (roomState.currentRound?.participantPlayerIds.has(playerId)) {
    roomState.currentRound.participantPlayerIds.delete(playerId);
  }

  if (roomState.currentRound?.nextRoundWinnerPlayerId === playerId) {
    roomState.currentRound.nextRoundWinnerPlayerId = null;
  }

  if (roomState.nextRoundOwnerPlayerId === playerId) {
    roomState.nextRoundOwnerPlayerId = null;
    await ensureNextRoundOwner();
  }
};
