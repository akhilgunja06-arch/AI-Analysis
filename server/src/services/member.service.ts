import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Public shape of a member. Deliberately excludes email, tokens, sessions and
 * any other private column. Privacy flags on UserPreference decide which of the
 * optional fields are included.
 */
export type PublicMember = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  headline: string | null;
  bio: string | null;
  location: string | null;
  timezone: string | null;
  languages: string[];
  websiteUrl: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  preferredFormat: string;
  emailVerified: boolean;
  memberSince: string;
  teaches: { skillId: string; name: string; slug: string; level: string; category: string; description: string | null }[];
  wants: { skillId: string; name: string; slug: string; level: string; category: string }[];
  availability: { weekday: number; startMinute: number; endMinute: number; format: string }[];
  stats: {
    completedExchanges: number;
    activeExchanges: number;
    reviewsCount: number;
    averageRating: number | null;
    followers: number;
    following: number;
  };
};

const memberSelect = {
  id: true,
  username: true,
  emailVerifiedAt: true,
  createdAt: true,
  preference: {
    select: {
      publicProfile: true,
      showEmail: true,
      showLocation: true,
      showLanguages: true,
      showAvailability: true,
      showCompletedExchanges: true,
    },
  },
  profile: {
    select: {
      displayName: true,
      headline: true,
      bio: true,
      avatarUrl: true,
      location: true,
      timezone: true,
      languages: true,
      websiteUrl: true,
      githubUrl: true,
      linkedinUrl: true,
      preferredFormat: true,
    },
  },
  skills: {
    where: { isActive: true },
    select: {
      skillId: true,
      direction: true,
      level: true,
      description: true,
      skill: { select: { name: true, slug: true, category: { select: { name: true } } } },
    },
  },
  availability: { select: { weekday: true, startMinute: true, endMinute: true, format: true } },
} satisfies Prisma.UserSelect;

type MemberRow = Prisma.UserGetPayload<{ select: typeof memberSelect }>;

export function shapeMember(
  row: MemberRow,
  stats: {
    completedExchanges: number;
    activeExchanges: number;
    reviewsCount: number;
    averageRating: number | null;
    followers: number;
    following: number;
  },
): PublicMember {
  const pref = row.preference;
  const profile = row.profile;

  return {
    id: row.id,
    username: row.username,
    displayName: profile?.displayName ?? row.username,
    avatarUrl: profile?.avatarUrl ?? null,
    headline: profile?.headline ?? null,
    bio: profile?.bio ?? null,
    location: pref?.showLocation === false ? null : (profile?.location ?? null),
    timezone: profile?.timezone ?? null,
    languages: pref?.showLanguages === false ? [] : (profile?.languages ?? []),
    websiteUrl: profile?.websiteUrl ?? null,
    githubUrl: profile?.githubUrl ?? null,
    linkedinUrl: profile?.linkedinUrl ?? null,
    preferredFormat: profile?.preferredFormat ?? 'ONLINE',
    emailVerified: Boolean(row.emailVerifiedAt),
    memberSince: row.createdAt.toISOString(),
    teaches: row.skills
      .filter((s) => s.direction === 'TEACH')
      .map((s) => ({
        skillId: s.skillId,
        name: s.skill.name,
        slug: s.skill.slug,
        level: s.level,
        category: s.skill.category.name,
        description: s.description,
      })),
    wants: row.skills
      .filter((s) => s.direction === 'LEARN')
      .map((s) => ({
        skillId: s.skillId,
        name: s.skill.name,
        slug: s.skill.slug,
        level: s.level,
        category: s.skill.category.name,
      })),
    availability: pref?.showAvailability === false ? [] : row.availability,
    stats: {
      completedExchanges: pref?.showCompletedExchanges === false ? 0 : stats.completedExchanges,
      activeExchanges: stats.activeExchanges,
      reviewsCount: stats.reviewsCount,
      averageRating: stats.averageRating,
      followers: stats.followers,
      following: stats.following,
    },
  };
}

export const memberSelectFields = memberSelect;

/** Aggregate statistics for a set of members, computed from real rows. */
export async function memberStats(userId: string) {
  const [completed, active, reviews, followers, following] = await Promise.all([
    prisma.exchangeParticipant.count({ where: { userId, status: 'COMPLETED' } }),
    prisma.exchangeParticipant.count({
      where: { userId, status: { in: ['AGREED', 'INVITED'] }, exchange: { status: { in: ['ACTIVE', 'ACCEPTED', 'PAUSED'] } } },
    }),
    prisma.review.aggregate({
      where: { subjectId: userId, hiddenAt: null },
      _count: { _all: true },
      _avg: { rating: true },
    }),
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
  ]);

  return {
    completedExchanges: completed,
    activeExchanges: active,
    reviewsCount: reviews._count._all,
    averageRating: reviews._avg.rating !== null ? Number(reviews._avg.rating.toFixed(2)) : null,
    followers,
    following,
  };
}

/** Profile completion, computed from stored fields. 0..100. */
export function profileCompletion(input: {
  hasAvatar: boolean;
  hasDisplayName: boolean;
  hasBio: boolean;
  hasLocation: boolean;
  hasLanguages: boolean;
  hasTimezone: boolean;
  teachesCount: number;
  wantsCount: number;
  availabilityCount: number;
  hasGoals: boolean;
}): { percent: number; missing: string[] } {
  const checks: [boolean, string][] = [
    [input.hasDisplayName, 'Add a display name'],
    [input.hasAvatar, 'Upload a profile photo'],
    [input.hasBio, 'Write a short biography'],
    [input.hasLocation, 'Add your location'],
    [input.hasTimezone, 'Set your timezone'],
    [input.hasLanguages, 'List the languages you speak'],
    [input.teachesCount > 0, 'Add at least one skill you can teach'],
    [input.wantsCount > 0, 'Add at least one skill you want to learn'],
    [input.availabilityCount > 0, 'Set your weekly availability'],
    [input.hasGoals, 'Describe your learning goals'],
  ];

  const done = checks.filter(([ok]) => ok).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    missing: checks.filter(([ok]) => !ok).map(([, label]) => label),
  };
}
