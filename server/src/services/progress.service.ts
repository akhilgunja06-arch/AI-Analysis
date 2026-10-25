/**
 * Single source of truth for exchange progress.
 *
 * Every surface that shows progress — the exchange list, the workspace, the
 * learning page and the dashboard widgets — must agree on both the percentage
 * and the denominator. Computing this inline per route previously produced
 * different numbers for the same exchange (for example 33% in the workspace
 * and 50% on the learning page).
 *
 * The agreed session plan (`Exchange.totalSessions`) is the primary measure
 * because it is what both members signed up for. Milestones are only used as a
 * fallback when no session plan was agreed.
 */
export type ExchangeProgressInput = {
  /** Sessions both members agreed to hold. Zero means no plan was set. */
  agreedSessions: number;
  /** Session rows that exist, whatever their status. */
  sessionsRecorded: number;
  sessionsCompleted: number;
  milestonesTotal: number;
  milestonesDone: number;
};

export type ExchangeProgress = {
  sessionsCompleted: number;
  sessionsTotal: number;
  milestonesDone: number;
  milestonesTotal: number;
  percent: number;
};

export function computeExchangeProgress(input: ExchangeProgressInput): ExchangeProgress {
  const sessionsTotal = input.agreedSessions > 0 ? input.agreedSessions : input.sessionsRecorded;

  const sessionPercent = sessionsTotal > 0 ? (input.sessionsCompleted / sessionsTotal) * 100 : null;
  const milestonePercent =
    input.milestonesTotal > 0 ? (input.milestonesDone / input.milestonesTotal) * 100 : null;

  // Never report more than 100%: extra sessions can be recorded beyond the plan.
  const percent = Math.min(100, Math.round(sessionPercent ?? milestonePercent ?? 0));

  return {
    sessionsCompleted: input.sessionsCompleted,
    sessionsTotal,
    milestonesDone: input.milestonesDone,
    milestonesTotal: input.milestonesTotal,
    percent,
  };
}
