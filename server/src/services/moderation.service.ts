import crypto from 'node:crypto';
import type { ModerationCategory, ModerationVerdict } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

/**
 * Safety moderation for peer chat and the study assistant.
 *
 * People use SkillSpring to talk about anything — study, code, careers, films,
 * their weekend. The policy therefore has no topic rule: an ordinary
 * conversation is always allowed. Only genuinely harmful content is acted on.
 *
 * This is a deterministic, explainable policy, not a classifier. It is
 * deliberately conservative about *blocking*: a false positive on "breast" in a
 * biology answer or "kill the process" in a Linux answer is far worse than a
 * missed borderline message, which a human can still report.
 *
 * Tiers
 *  - BLOCK: unambiguous sexual solicitation, credible threats, self-harm risk,
 *           and spam/scam offers.
 *  - WARN:  mildly abusive language. Allowed through, but the sender is told
 *           and the event is recorded.
 *  - ALLOW: everything else, including off-topic chat.
 *
 * Repeated WARNs escalate into a temporary messaging restriction; repeated
 * BLOCKs into a suspension, both handled in enforcement.service.ts.
 */

export type ModerationDecision = {
  verdict: ModerationVerdict;
  category: ModerationCategory;
  /** 0 = fine, 1 = minor, 2 = serious, 3 = severe (safety review). */
  severity: number;
  /** Short, non-content explanation safe to show the sender. */
  reason: string;
};

const ALLOW: ModerationDecision = {
  verdict: 'ALLOW',
  category: 'EDUCATIONAL',
  severity: 0,
  reason: 'Allowed.',
};

/**
 * Words that make a message academic even if it also contains a sensitive term.
 * Checked before the sexual filter so anatomy and biology stay usable.
 */
const ACADEMIC_ANCHORS = [
  'anatomy', 'biology', 'physiology', 'reproduction', 'reproductive', 'cell',
  'cells', 'organ', 'hormone', 'hormones', 'genetics', 'chromosome', 'mitosis',
  'meiosis', 'embryo', 'pregnancy', 'medical', 'medicine', 'clinical', 'nursing',
  'patient', 'diagnosis', 'symptom', 'disease', 'infection', 'puberty', 'health',
  'education', 'hygiene', 'contraception', 'std', 'sti', 'exam', 'chapter',
  'diagram', 'explain', 'definition', 'difference between', 'function of',
];

/** Unambiguous sexual solicitation. Not anatomy words in an academic context. */
const SEXUAL_PATTERNS: { re: RegExp; severity: number }[] = [
  { re: /\b(?:send|show|share)\s+(?:me\s+)?(?:your\s+)?(?:nudes?|naked|pics?\s+of\s+yourself)\b/i, severity: 3 },
  { re: /\b(?:sext(?:ing)?|cyber(?:sex|ing)|horny|turn\s+me\s+on)\b/i, severity: 3 },
  { re: /\b(?:porn|porno|pornography|xxx|cam\s*girl|cam\s*boy|onlyfans)\b/i, severity: 3 },
  { re: /\b(?:have|want)\s+sex\b|\bsex\s+chat\b|\bsex\s+with\s+(?:me|you)\b/i, severity: 3 },
  { re: /\b(?:blow\s*job|hand\s*job|anal|orgasm|masturbat\w*)\b/i, severity: 3 },
];

const THREAT_PATTERNS: { re: RegExp; severity: number }[] = [
  {
    // Allows a short clause between the intent and the act, as in
    // "I will find you and hurt you".
    re: /\bi(?:'ll|ll|\s+will|\s+am\s+going\s+to|\s+gonna)\s+(?:\w+\s+){0,5}?(?:kill|hurt|stab|shoot|beat)\s+you\b/i,
    severity: 3,
  },
  { re: /\b(?:kill|murder|rape)\s+you\b/i, severity: 3 },
  { re: /\bi\s+know\s+where\s+you\s+live\b/i, severity: 3 },
  { re: /\b(?:dox|doxx?ing)\s+you\b/i, severity: 3 },
];

/** Harassment that is abusive without being a credible threat. */
const HARASSMENT_PATTERNS: { re: RegExp; severity: number }[] = [
  { re: /\b(?:you(?:'re|\s+are)\s+)?(?:a\s+)?(?:stupid|worthless|pathetic|disgusting|retard(?:ed)?|idiot|moron|loser)\b/i, severity: 1 },
  { re: /\b(?:kill\s+yourself|kys|go\s+die)\b/i, severity: 3 },
  { re: /\b(?:shut\s+up|nobody\s+(?:likes|cares\s+about)\s+you)\b/i, severity: 1 },
  { re: /\bf+u+c+k+\s+(?:you|off)\b/i, severity: 1 },
];

const SPAM_PATTERNS: { re: RegExp; severity: number }[] = [
  { re: /\b(?:earn|make)\s+\$?\d[\d,.]*\s*(?:usd|dollars?)?\s*(?:per|a|each)\s+(?:day|week|hour)\b/i, severity: 2 },
  { re: /\b(?:free\s+)?(?:crypto|bitcoin|usdt)\s+(?:giveaway|doubler|investment)\b/i, severity: 2 },
  { re: /\bclick\s+(?:here|this\s+link)\s+to\s+(?:win|claim|earn)\b/i, severity: 2 },
  { re: /\b(?:whats\s*app|telegram)\s+(?:me|\+?\d{6,})\b/i, severity: 1 },
  { re: /\b(?:buy|order)\s+(?:followers|likes|subscribers)\b/i, severity: 2 },
];

/** Content that needs a human safety review, never an automatic ban. */
const SELF_HARM_PATTERNS: { re: RegExp; severity: number }[] = [
  { re: /\b(?:i\s+(?:want|plan)\s+to\s+(?:die|kill\s+myself)|suicidal)\b/i, severity: 3 },
  { re: /\b(?:self[\s-]?harm|cutting\s+myself)\b/i, severity: 2 },
];

function normalise(text: string): string {
  return text
    .normalize('NFKC')
    // Collapse repeated characters used to dodge filters: "seeeex" -> "seex".
    .replace(/(.)\1{2,}/g, '$1$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function isAcademicContext(lower: string): boolean {
  return ACADEMIC_ANCHORS.some((anchor) => lower.includes(anchor));
}

/** Runs the policy. Pure: no database access, no side effects. */
export function classify(text: string): ModerationDecision {
  const normalised = normalise(text);
  const lower = normalised.toLowerCase();

  if (!lower) return ALLOW;

  // Safety first: credible threats and self-harm are never "academic".
  for (const rule of THREAT_PATTERNS) {
    if (rule.re.test(normalised)) {
      return {
        verdict: 'BLOCK',
        category: 'THREAT',
        severity: rule.severity,
        reason: 'Messages that threaten another person are not allowed.',
      };
    }
  }
  for (const rule of SELF_HARM_PATTERNS) {
    if (rule.re.test(normalised)) {
      return {
        verdict: 'BLOCK',
        category: 'SELF_HARM',
        severity: rule.severity,
        reason:
          'This message suggests you may be at risk. It has not been delivered. If you are in danger, please contact local emergency services or a crisis line.',
      };
    }
  }

  // Sexual content, unless the message is clearly an academic discussion.
  const academic = isAcademicContext(lower);
  for (const rule of SEXUAL_PATTERNS) {
    if (rule.re.test(normalised) && !academic) {
      return {
        verdict: 'BLOCK',
        category: 'SEXUAL',
        severity: rule.severity,
        reason: 'Sexual messages are not allowed in SkillSpring chat.',
      };
    }
  }

  for (const rule of SPAM_PATTERNS) {
    if (rule.re.test(normalised)) {
      return {
        verdict: 'BLOCK',
        category: 'SPAM',
        severity: rule.severity,
        reason: 'Advertising, recruitment and money-making offers are not allowed in chat.',
      };
    }
  }

  for (const rule of HARASSMENT_PATTERNS) {
    if (rule.re.test(normalised)) {
      return {
        verdict: rule.severity >= 3 ? 'BLOCK' : 'WARN',
        category: 'HARASSMENT',
        severity: rule.severity,
        reason: 'Please keep messages respectful. Abusive language is not allowed here.',
      };
    }
  }

  return ALLOW;
}

export function hashContent(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Classifies and, when the verdict is not ALLOW, records the decision.
 * The message body is never copied into the audit trail — only its hash.
 */
export async function reviewText(params: {
  userId: string;
  text: string;
  surface?: string;
  messageId?: string;
}): Promise<ModerationDecision> {
  const decision = classify(params.text);
  if (decision.verdict === 'ALLOW') return decision;

  try {
    await prisma.moderationEvent.create({
      data: {
        userId: params.userId,
        surface: params.surface ?? 'MESSAGE',
        messageId: params.messageId ?? null,
        verdict: decision.verdict,
        category: decision.category,
        severity: decision.severity,
        reason: decision.reason,
        contentHash: hashContent(normalise(params.text)),
      },
    });
  } catch (err) {
    // Never fail a message because the audit write failed.
    logger.error('moderation.event_write_failed', { userId: params.userId, err });
  }

  return decision;
}
