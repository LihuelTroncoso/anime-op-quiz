import { Prisma } from "@prisma/client";
import { HttpError } from "../domain/http-error";
import { prisma } from "./prisma.client";

export type User = {
	id: number;
	name: string;
	score: number;
};

export default class HistoryUserDao {
	async getUsers(): Promise<User[]> {
		return await prisma.historyUser.findMany();
	}

	async createUser(name: string) {
		try {
			return await prisma.historyUser.create({ data: { name } });
		} catch (e) {
			if (e instanceof Prisma.PrismaClientKnownRequestError) {
				throw new HttpError(500, "Username already exists");
			}
			return null;
		}
	}

	async updateUserScore(id: number, score: number): Promise<User> {
		return await prisma.historyUser.update({
			where: { id },
			data: { score },
		});
	}

	async resetScores(): Promise<void> {
		await prisma.historyUser.updateMany({
			data: { score: 0 },
		});
	}

	async findUser(id: number) {
		return await prisma.historyUser.findUnique({ where: { id } });
	}
}
