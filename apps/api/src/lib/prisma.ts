import { PrismaClient } from '@prisma/client';

// Jedyna instancja PrismaClient w aplikacji (konwencja: klient w jednym module,
// dostęp z auth.ts i warstwy tras/serwisów). Ułatwia przyszły upgrade Prisma 6→7.
export const prisma = new PrismaClient();
