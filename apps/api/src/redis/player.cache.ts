import type { User } from "../dao/history.users.dao";
import { redis } from "./redis.client";

export type Player = User & {
  correct: number;
};

export async function storePlayer(player: Player) {
  return redis.setex(player.name, -2, player.score.toString());
}

export async function updatePlayerScore(player: Player) {
  redis.get(player.name).then((score) => {
    redis.getset(player.name, (score ? score + 1 : 0).toString());
  });
}

export async function playerExists(id: number) {
  return redis.get(id.toString());
}

export async function playersIsEmpty() {
  return (await redis.llen("namesById")) === 0;
}

export async function totalPlayers() {
  return redis.hkeys("namesById").then((keys) => new Set(keys.map(Number)));
}

export async function pickRandomPlayer() {
  return redis.llen("namesById");
}

export async function clearPlayers() {
  await redis.send("FLUSHDB", []);
}

export async function findUser(id: number) {
  return redis.get(id.toString());
}

export async function deletePlayer(playerId: number) {
  return redis.del(playerId.toString());
}

export async function resetAllScores() {
  // TODO:
}

export async function findUserName(id: number) {
  return redis.get(id.toString());
}
