import { ExchangeStatus } from '@prisma/client';
import { ApiError } from '../lib/errors';

/**
 * The skill-exchange lifecycle. Transitions are defined once, here, and every
 * status change in the codebase goes through `assertTransition`, so an invalid
 * state can never be written by a stray endpoint.
 *
 *   PENDING ──accept──▶ ACCEPTED ──start──▶ ACTIVE ──complete──▶ COMPLETED
 *      │  │                 │                  │  ▲
 *      │  │                 │                  │  └──resume── PAUSED
 *      │  │                 │                  └──pause──▶ PAUSED
 *      │  └─counter──▶ COUNTERED ─accept─▶ ACCEPTED
 *      ├─decline──▶ DECLINED
 *      └─withdraw─▶ WITHDRAWN
 *   ACCEPTED/ACTIVE/PAUSED ─cancel─▶ CANCELLED
 */
export const EXCHANGE_TRANSITIONS: Record<ExchangeStatus, ExchangeStatus[]> = {
  PENDING: ['ACCEPTED', 'DECLINED', 'WITHDRAWN', 'COUNTERED', 'CANCELLED'],
  COUNTERED: ['ACCEPTED', 'DECLINED', 'WITHDRAWN', 'CANCELLED'],
  ACCEPTED: ['ACTIVE', 'CANCELLED', 'PAUSED'],
  ACTIVE: ['PAUSED', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['ACTIVE', 'CANCELLED', 'COMPLETED'],
  COMPLETED: [],
  DECLINED: [],
  WITHDRAWN: [],
  CANCELLED: [],
};

export const TERMINAL_EXCHANGE_STATUSES: ExchangeStatus[] = [
  'COMPLETED',
  'DECLINED',
  'WITHDRAWN',
  'CANCELLED',
];

export function canTransition(from: ExchangeStatus, to: ExchangeStatus): boolean {
  return EXCHANGE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: ExchangeStatus, to: ExchangeStatus): ExchangeStatus {
  if (!canTransition(from, to)) {
    throw ApiError.conflict(
      `An exchange in status ${from} cannot move to ${to}.`,
      { from, to, allowed: EXCHANGE_TRANSITIONS[from] ?? [] },
    );
  }
  return to;
}

export function isTerminal(status: ExchangeStatus): boolean {
  return TERMINAL_EXCHANGE_STATUSES.includes(status);
}

/** Human-readable labels used by the timeline UI. */
export const EXCHANGE_STATUS_LABEL: Record<ExchangeStatus, string> = {
  PENDING: 'Awaiting response',
  COUNTERED: 'Counter-proposal sent',
  ACCEPTED: 'Accepted — not started',
  ACTIVE: 'In progress',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  DECLINED: 'Declined',
  WITHDRAWN: 'Withdrawn',
  CANCELLED: 'Cancelled',
};

/**
 * Which side may perform which action.
 * `initiator` is the member who sent the request; `recipient` received it.
 */
export type ExchangeAction =
  | 'accept'
  | 'decline'
  | 'withdraw'
  | 'counter'
  | 'start'
  | 'pause'
  | 'resume'
  | 'complete'
  | 'cancel';

const ACTION_PERMITTED_STATUSES: Record<ExchangeAction, ExchangeStatus[]> = {
  accept: ['PENDING', 'COUNTERED'],
  decline: ['PENDING', 'COUNTERED'],
  withdraw: ['PENDING', 'COUNTERED'],
  counter: ['PENDING', 'COUNTERED'],
  start: ['ACCEPTED'],
  pause: ['ACTIVE', 'ACCEPTED'],
  resume: ['PAUSED'],
  complete: ['ACTIVE', 'PAUSED'],
  cancel: ['PENDING', 'ACCEPTED', 'ACTIVE', 'PAUSED'],
};

export function isActionAllowedForStatus(action: ExchangeAction, status: ExchangeStatus): boolean {
  return ACTION_PERMITTED_STATUSES[action].includes(status);
}

export const ACTION_TARGET_STATUS: Record<ExchangeAction, ExchangeStatus> = {
  accept: 'ACCEPTED',
  decline: 'DECLINED',
  withdraw: 'WITHDRAWN',
  counter: 'COUNTERED',
  start: 'ACTIVE',
  pause: 'PAUSED',
  resume: 'ACTIVE',
  complete: 'COMPLETED',
  cancel: 'CANCELLED',
};

/**
 * Who may trigger each action, relative to a member's side of the request.
 *   both    — either participant
 *   recipient — only the member who received the request
 *   initiator — only the member who sent the request
 */
export const ACTION_ACTOR: Record<ExchangeAction, 'both' | 'recipient' | 'initiator'> = {
  accept: 'recipient',
  decline: 'recipient',
  withdraw: 'initiator',
  counter: 'recipient',
  start: 'both',
  pause: 'both',
  resume: 'both',
  complete: 'both',
  cancel: 'both',
};

export function assertActionAllowed(
  action: ExchangeAction,
  status: ExchangeStatus,
  side: 'initiator' | 'recipient',
): ExchangeStatus {
  if (!isActionAllowedForStatus(action, status)) {
    throw ApiError.conflict(`You cannot ${action} an exchange that is ${status.toLowerCase()}.`, {
      action,
      status,
      permittedStatuses: ACTION_PERMITTED_STATUSES[action],
    });
  }
  const allowedActor = ACTION_ACTOR[action];
  if (allowedActor !== 'both' && allowedActor !== side) {
    throw ApiError.forbidden(`Only the ${allowedActor} of this request can ${action} it.`, {
      action,
      requiredActor: allowedActor,
    });
  }
  return ACTION_TARGET_STATUS[action];
}
