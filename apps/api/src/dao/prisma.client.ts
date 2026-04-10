import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

const resolveDatabaseUrl = (url = "") => {
	if (!url) {
		return `file:${resolve(repoRoot, "dev.db")}`;
	}

	if (!url.startsWith("file:")) {
		return url;
	}

	const filePath = url.slice("file:".length);
	if (
		!filePath ||
		filePath.startsWith("/") ||
		filePath.startsWith(":memory:")
	) {
		return url;
	}

	return `file:${resolve(repoRoot, filePath)}`;
};

const adapter = new PrismaLibSql({
	url: resolveDatabaseUrl(process.env.DATABASE_URL),
});
export const prisma = new PrismaClient({ adapter });
