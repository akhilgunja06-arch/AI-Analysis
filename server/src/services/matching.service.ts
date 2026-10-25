/**
 * Deterministic, documented matching engine.
 *
 * This is NOT a machine-learning model and the API never claims that it is.
 * Every score is produced by the fixed arithmetic below, so any user can
 * reproduce and explain their own match list.
 *
 * Total score = 0..100, assembled from weighted components:
 *
 *   1. Reciprocal skill fit        (max 55)
 *      a. They teach a skill I want to learn        (max 30, best match counts)
 *      b. They want to learn a skill I teach        (max 25, best match counts)
 *
 *   2. Language overlap            (max 12)
 *      3 points per shared language, capped at 12.
 *
 *   3. Timezone proximity          (max 10)
 *      10 when the UTC offsets differ by <= 2h, then -2 per extra hour of
 *      difference down to a floor of 0 at 12h+ apart.
 *
 *   4. Availability overlap        (max 13)
 *      Overlapping weekly windows, 1 point per overlapping hour, capped at 13.
 *
 *   5. Reputation                  (max 10)
 *      (mean rating - 1) / 4 * 10, i.e. 5 stars maps to 10 points. Members with
 *      no reviews yet receive a neutral 4.0 baseline so newcomers are not hidden.
 *
 * Component weights sum to 100. Ties are broken by username for stable ordering.
 */

export type SkillRef = { skillId: string; skillName: string; level: string };

export type AvailabilityWindow = { weekday: number; startMinute: number; endMinute: number };

export type MatchCandidate = {
  userId: string;
  username: string;
  teaches: SkillRef[];
  wants: SkillRef[];
  languages: string[];
  timezone: string;
  availability: AvailabilityWindow[];
  averageRating: number | null;
  reviewCount: number;
};

export type MatchSubject = {
  userId: string;
  teaches: SkillRef[];
  wants: SkillRef[];
  languages: string[];
  timezone: string;
  availability: AvailabilityWindow[];
};

export type MatchBreakdown = {
  skillTeachToLearn: number;
  skillLearnToTeach: number;
  language: number;
  timezone: number;
  availability: number;
  reputation: number;
};

export type MatchResult = {
  userId: string;
  username: string;
  score: number;
  breakdown: MatchBreakdown;
  reasons: string[];
  theyTeachWhatIWant: SkillRef[];
  iTeachWhatTheyWant: SkillRef[];
  sharedLanguages: string[];
  timezoneOffsetHours: number | null;
  overlapHoursPerWeek: number;
};

const WEIGHTS = {
  teachToLearn: 30,
  learnToTeach: 25,
  languagePerMatch: 3,
  languageCap: 12,
  timezoneMax: 10,
  timezoneComfortHours: 2,
  availabilityPerHour: 1,
  availabilityCap: 13,
  reputationMax: 10,
  neutralRating: 4,
} as const;

/** Minutes east of UTC for a named IANA zone at a given instant. */
export function timezoneOffsetMinutes(timezone: string, at: Date = new Date()): number | null {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = dtf.formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
    const asUTC = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour') === 24 ? 0 : get('hour'),
      get('minute'),
      get('second'),
    );
    return Math.round((asUTC - at.getTime()) / 60000);
  } catch {
    return null;
  }
}

/** Hours per week where two members' weekly windows intersect. */
export function availabilityOverlapHours(a: AvailabilityWindow[], b: AvailabilityWindow[]): number {
  let minutes = 0;
  for (const wa of a) {
    for (const wb of b) {
      if (wa.weekday !== wb.weekday) continue;
      const start = Math.max(wa.startMinute, wb.startMinute);
      const end = Math.min(wa.endMinute, wb.endMinute);
      if (end > start) minutes += end - start;
    }
  }
  return minutes / 60;
}

export function computeMatch(subject: MatchSubject, candidate: MatchCandidate): MatchResult {
  const reasons: string[] = [];
  const breakdown: MatchBreakdown = {
    skillTeachToLearn: 0,
    skillLearnToTeach: 0,
    language: 0,
    timezone: 0,
    availability: 0,
    reputation: 0,
  };

  // --- 1a. They teach a skill I want to learn
  const myWantedIds = new Set(subject.wants.map((s) => s.skillId));
  const theyTeachWhatIWant = candidate.teaches.filter((s) => myWantedIds.has(s.skillId));
  if (theyTeachWhatIWant.length > 0) {
    breakdown.skillTeachToLearn = WEIGHTS.teachToLearn;
    reasons.push(
      `Teaches ${theyTeachWhatIWant.map((s) => s.skillName).join(', ')} — a skill you want to learn.`,
    );
  }

  // --- 1b. They want to learn a skill I teach
  const theirWantedIds = new Set(candidate.wants.map((s) => s.skillId));
  const iTeachWhatTheyWant = subject.teaches.filter((s) => theirWantedIds.has(s.skillId));
  if (iTeachWhatTheyWant.length > 0) {
    breakdown.skillLearnToTeach = WEIGHTS.learnToTeach;
    reasons.push(
      `Wants to learn ${iTeachWhatTheyWant.map((s) => s.skillName).join(', ')} — a skill you teach.`,
    );
  }

  if (breakdown.skillTeachToLearn > 0 && breakdown.skillLearnToTeach > 0) {
    reasons.unshift('Reciprocal exchange: you can both teach and learn from each other.');
  }

  // --- 2. Shared languages
  const subjectLanguages = new Set(subject.languages.map((l) => l.toLowerCase()));
  const sharedLanguages = candidate.languages.filter((l) => subjectLanguages.has(l.toLowerCase()));
  breakdown.language = Math.min(WEIGHTS.languageCap, sharedLanguages.length * WEIGHTS.languagePerMatch);
  if (sharedLanguages.length > 0) {
    reasons.push(`Shares ${sharedLanguages.join(', ')} as a common language.`);
  }

  // --- 3. Timezone proximity
  const myOffset = timezoneOffsetMinutes(subject.timezone);
  const theirOffset = timezoneOffsetMinutes(candidate.timezone);
  let diffHours: number | null = null;
  if (myOffset !== null && theirOffset !== null) {
    diffHours = Math.abs(myOffset - theirOffset) / 60;
    if (diffHours <= WEIGHTS.timezoneComfortHours) {
      breakdown.timezone = WEIGHTS.timezoneMax;
      reasons.push('In a timezone that overlaps well with your working hours.');
    } else {
      const penalty = (diffHours - WEIGHTS.timezoneComfortHours) * 2;
      breakdown.timezone = Math.max(0, Math.round(WEIGHTS.timezoneMax - penalty));
      if (breakdown.timezone > 0) {
        reasons.push(`Timezone is ${diffHours.toFixed(1)} hours away — some overlap is possible.`);
      }
    }
  }

  // --- 4. Availability overlap
  const overlap = availabilityOverlapHours(subject.availability, candidate.availability);
  breakdown.availability = Math.min(WEIGHTS.availabilityCap, Math.round(overlap * WEIGHTS.availabilityPerHour));
  if (overlap >= 1) {
    reasons.push(`${overlap.toFixed(1)} hours of shared weekly availability.`);
  }

  // --- 5. Reputation
  const rating = candidate.reviewCount > 0 ? (candidate.averageRating ?? WEIGHTS.neutralRating) : WEIGHTS.neutralRating;
  breakdown.reputation = Math.max(0, Math.min(WEIGHTS.reputationMax, ((rating - 1) / 4) * WEIGHTS.reputationMax));
  if (candidate.reviewCount > 0 && rating >= 4) {
    reasons.push(`Rated ${rating.toFixed(1)}/5 across ${candidate.reviewCount} review${candidate.reviewCount === 1 ? '' : 's'}.`);
  }

  const score = Math.round(
    breakdown.skillTeachToLearn +
      breakdown.skillLearnToTeach +
      breakdown.language +
      breakdown.timezone +
      breakdown.availability +
      breakdown.reputation,
  );

  return {
    userId: candidate.userId,
    username: candidate.username,
    score,
    breakdown,
    reasons,
    theyTeachWhatIWant,
    iTeachWhatTheyWant,
    sharedLanguages,
    timezoneOffsetHours: diffHours,
    overlapHoursPerWeek: Number(overlap.toFixed(2)),
  };
}

export function rankMatches(subject: MatchSubject, candidates: MatchCandidate[]): MatchResult[] {
  return candidates
    .map((c) => computeMatch(subject, c))
    .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));
}

export const MATCH_WEIGHTS = WEIGHTS;
