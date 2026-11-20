import type { Prisma } from '@prisma/client';

/**
 * Matches a real block, as opposed to the `DISMISSED_MATCH` rows the matching
 * page writes into the same table.
 *
 * `reason` is nullable and SQL's `NOT (reason = '…')` is unknown for NULL, so
 * the null case must be spelled out — otherwise genuine blocks are silently
 * treated as absent and a blocked member can still message or call.
 */
export const REAL_BLOCK: Prisma.UserBlockWhereInput = {
  OR: [{ reason: null }, { reason: { not: 'DISMISSED_MATCH' } }],
};

/**
 * A block between two specific members, in either direction. Composed with
 * `AND` because both this and the caller-supplied `OR` use the same key.
 */
export function blockBetween(a: string, b: string): Prisma.UserBlockWhereInput {
  return {
    AND: [
      { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
      REAL_BLOCK,
    ],
  };
}

/** Ids of members the caller has blocked, or who have blocked the caller. */
export async function blockedPartnerIds(
  prismaClient: {
    userBlock: { findMany: (args: Prisma.UserBlockFindManyArgs) => Promise<{ blockerId: string; blockedId: string }[]> };
  },
  userId: string,
): Promise<Set<string>> {
  const blocks = await prismaClient.userBlock.findMany({
    where: {
      AND: [{ OR: [{ blockerId: userId }, { blockedId: userId }] }, REAL_BLOCK],
    },
    select: { blockerId: true, blockedId: true },
  });

  const ids = new Set<string>();
  for (const block of blocks) {
    ids.add(block.blockerId === userId ? block.blockedId : block.blockerId);
  }
  return ids;
}

/** Deterministic key so a 1:1 conversation can never be duplicated. */
export function directKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}
