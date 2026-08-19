import { PrismaClient } from '@prisma/client';

// Single shared Prisma client instance, imported everywhere instead of
// each module creating its own (avoids exhausting Postgres connections).
const prisma = new PrismaClient();

export default prisma;
