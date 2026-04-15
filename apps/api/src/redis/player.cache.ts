import type { User } from "../dao/history.users.dao";
import { redis } from "./redis.client";

export type Player = User & {
  correct: number;
  attempted: number;
};
export default class PlayerCache {
  storePlayer(player: Player) {
    const { id, ...fields } = player;
    redis.sadd("playersIds", id.toString());
    return redis.hset(`player:${id}`, fields);
  }

  async updatePlayerScore(player: Player) {
    redis.hset(`player:${player.id}`, {
      score: player.score,
      correct: player.correct,
      attempted: player.attempted,
    });
  }

  async playerExists(id: number) {
    return redis.hkeys(`player:${id}`);
  }

  async playersIsEmpty() {
    return (await redis.smembers("playersIds")).length !== 0;
  }

  async totalPlayers() {
    return redis
      .smembers("playersIds")
      .then((keys) => new Set(keys.map(Number)));
  }

  async pickRandomPlayer() {
    return Number(await redis.srandmember("playersIds"));
  }

  async clearPlayers() {
    await redis.send("FLUSHDB", []);
  }

  async findPlayer(id: number) {
    const values = await redis.hgetall(`player:${id}`);

    if (Object.keys(values).length === 0) {
      return null;
    }

    return {
      id,
      name: values.name,
      score: Number(values.score ?? 0),
      correct: Number(values.correct ?? 0),
      attempted: Number(values.attempted ?? 0),
    };
  }

  async deletePlayer(playerId: number) {
    return redis.del(`player:${playerId}`);
  }

  async resetAllScores() {
    const playerIds = await this.getAllIds();
    await Promise.all(
      playerIds.map((playerId) =>
        redis.hset(`player:${playerId}`, {
          score: 0,
          correct: 0,
        }),
      ),
    );
  }

  async getAllPlayers() {
    const playerIds = await this.getAllIds();
    return Promise.all(
      playerIds.map(async (id) => {
        const values = await redis.hgetall(`player:${id}`);
        console.log(values);
        return {
          playerId: id,
          name: values.name,
          score: Number(values.score ?? 0),
          correct: Number(values.correct ?? 0),
          attempted: Number(values.attempted ?? 0),
        };
      }),
    );
  }

  async findPlayerName(id: number) {
    return redis.get(id.toString());
  }

  async getAllIds() {
    return redis.smembers("playersIds");
  }
}
