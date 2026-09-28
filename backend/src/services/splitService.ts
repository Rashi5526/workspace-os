import { prisma } from "../lib/prisma"

export interface SplitInput {
  /** userId -> share percent. Must sum to 100. */
  shares: Record<string, number>
  payerId: string
}

/**
 * Computes each participant's owed amount from the transaction amount and
 * their share percentage. This is the single source of truth for split
 * math — nothing in the API accepts a pre-computed "owedAmount" from the
 * client.
 *
 * Example: ₹4,500 expense paid by Rashi, split 50/50 with a friend:
 *   computeSplit(4500, { paid by Rashi }, { rashi: 50, friend: 50 })
 *   -> friend owes Rashi ₹2,250 (rashi's own row is owedAmount: 0 since the
 *      payer doesn't owe themselves).
 */
export function computeSplitShares(amount: number, input: SplitInput) {
  const totalPercent = Object.values(input.shares).reduce((a, b) => a + b, 0)
  if (Math.round(totalPercent * 100) !== 10000) {
    throw new Error(`Split percentages must sum to 100 (got ${totalPercent})`)
  }

  return Object.entries(input.shares).map(([userId, sharePercent]) => {
    const isPayer = userId === input.payerId
    const shareAmount = round2((amount * sharePercent) / 100)
    // The payer already paid for their own share; what they're "owed" from
    // this row is 0 — what OTHER participants owe the payer is their share.
    const owedAmount = isPayer ? 0 : shareAmount
    return { userId, sharePercent, owedAmount, isPayer }
  })
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Net balance between the current user and every other user in a world:
 * positive = they owe you, negative = you owe them. Computed live from
 * unsettled split transactions — never stored as a running total, so it
 * can't drift out of sync with the underlying transactions.
 */
export async function computeWorldBalances(worldId: string) {
  const participants = await prisma.splitParticipant.findMany({
    where: {
      transaction: { worldId, isSplit: true, settledAt: null, deletedAt: null },
      isPayer: false,
    },
    include: { transaction: { select: { payerId: true } } },
  })

  const balances = new Map<string, number>() // key: `${payerId}|${owerId}` -> amount owed to payer
  for (const p of participants) {
    const key = `${p.transaction.payerId}|${p.userId}`
    balances.set(key, (balances.get(key) ?? 0) + p.owedAmount)
  }

  return Array.from(balances.entries()).map(([key, amount]) => {
    const [owedToUserId, owedByUserId] = key.split("|")
    return { owedToUserId, owedByUserId, amount: Math.round(amount * 100) / 100 }
  })
}
