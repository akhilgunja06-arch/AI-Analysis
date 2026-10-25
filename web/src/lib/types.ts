/** Shared API types. These mirror the shapes the backend actually returns. */

export type Role = 'MEMBER' | 'MODERATOR' | 'ADMIN';
export type AccountStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
export type SkillDirection = 'TEACH' | 'LEARN';
export type SkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
export type SessionFormat = 'ONLINE' | 'IN_PERSON' | 'EITHER';
export type ExchangeStatus =
  | 'PENDING'
  | 'COUNTERED'
  | 'ACCEPTED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'DECLINED'
  | 'WITHDRAWN'
  | 'CANCELLED';

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  role: Role;
  status: AccountStatus;
  emailVerified: boolean;
};

export type Preferences = {
  id: string;
  publicProfile: boolean;
  showEmail: boolean;
  showLocation: boolean;
  showLanguages: boolean;
  showAvailability: boolean;
  showCompletedExchanges: boolean;
  allowExchangeRequests: boolean;
  allowMessagesFrom: 'MEMBERS' | 'FOLLOWING' | 'NOBODY';
  emailOnExchange: boolean;
  emailOnMessage: boolean;
  emailOnSession: boolean;
  emailOnReview: boolean;
  emailOnCommunity: boolean;
  inAppOnEverything: boolean;
  weeklyDigest: boolean;
  reducedMotion: boolean;
  theme: 'light' | 'dark' | 'system';
};

export type Profile = {
  id: string;
  userId: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  avatarUrl: string | null;
  location: string | null;
  timezone: string;
  languages: string[];
  websiteUrl: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  preferredFormat: SessionFormat;
  learningGoals: string | null;
  weeklyAvailabilityHours: number | null;
  onboardingCompletedAt: string | null;
  onboardingStep: number;
};

export type Completion = { percent: number; missing: string[] };

export type SkillRef = {
  skillId: string;
  name: string;
  slug: string;
  level: SkillLevel;
  category: string;
  description?: string | null;
};

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
  preferredFormat: SessionFormat;
  emailVerified: boolean;
  memberSince: string;
  teaches: SkillRef[];
  wants: SkillRef[];
  availability: { weekday: number; startMinute: number; endMinute: number; format: SessionFormat }[];
  stats: {
    completedExchanges: number;
    activeExchanges: number;
    reviewsCount: number;
    averageRating: number | null;
    followers: number;
    following: number;
  };
};

export type MemberProfileResponse = PublicMember & {
  reviews: ReviewItem[];
  portfolio: { id: string; skill: string; url: string | null }[];
  viewer: {
    isSelf: boolean;
    isFollowing: boolean;
    isBlocked: boolean;
    blockedByViewer: boolean;
    canMessage: boolean;
  };
};

export type ReviewItem = {
  id: string;
  rating: number;
  teachingRating?: number | null;
  communicationRating?: number | null;
  reliabilityRating?: number | null;
  comment: string | null;
  createdAt: string;
  author: { username: string; displayName: string; avatarUrl: string | null };
  exchange?: { id: string; title: string };
};

export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
  skillCount: number;
  teacherCount: number;
};

export type Skill = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: { id: string; name: string; slug: string };
  memberCount: number;
};

export type TrendingSkill = {
  id: string;
  name: string;
  slug: string;
  category: { name: string; slug: string };
  teachers: number;
  learners: number;
  totalActivity: number;
};

export type UserSkillEntry = {
  id: string;
  direction: SkillDirection;
  level: SkillLevel;
  description: string | null;
  outcomes: string | null;
  portfolioUrl: string | null;
  yearsExperience: number | null;
  isActive: boolean;
  createdAt: string;
  skill: { id: string; name: string; slug: string; category: { id: string; name: string; slug: string } };
};

export type MatchBreakdown = {
  skillTeachToLearn: number;
  skillLearnToTeach: number;
  language: number;
  timezone: number;
  availability: number;
  reputation: number;
};

export type Match = {
  userId: string;
  username: string;
  score: number;
  breakdown: MatchBreakdown;
  reasons: string[];
  theyTeachWhatIWant: { skillId: string; skillName: string; level: string }[];
  iTeachWhatTheyWant: { skillId: string; skillName: string; level: string }[];
  sharedLanguages: string[];
  timezoneOffsetHours: number | null;
  overlapHoursPerWeek: number;
  dismissed: boolean;
  profile: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    headline: string | null;
    location: string | null;
    timezone: string | null;
  } | null;
};

export type MatchCriteria = {
  description: string;
  weights: Record<string, number>;
  yourSkillCounts: { teaches: number; wants: number };
};

export type ExchangeRequestItem = {
  id: string;
  status: ExchangeStatus;
  statusLabel: string;
  message: string | null;
  goals: string | null;
  terms: {
    sessionMinutes: number;
    sessionsPerWeek: number;
    totalSessions: number;
    preferredFormat: SessionFormat;
  };
  createdAt: string;
  respondedAt: string | null;
  exchangeId: string | null;
  initiator: { id: string; username: string; displayName: string; avatarUrl: string | null };
  recipient: { id: string; username: string; displayName: string; avatarUrl: string | null };
  offeredSkill: { id: string; name: string } | null;
  requestedSkill: { id: string; name: string } | null;
};

export type ExchangeParticipantView = {
  userId: string;
  role: 'INITIATOR' | 'RECIPIENT';
  status: 'INVITED' | 'AGREED' | 'COMPLETED' | 'LEFT';
  isMe: boolean;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  timezone: string | null;
  agreedAt: string | null;
  completedAt: string | null;
  teaches: { id: string; name: string; slug: string } | null;
  learns: { id: string; name: string; slug: string } | null;
};

export type ExchangeSummary = {
  id: string;
  title: string;
  status: ExchangeStatus;
  statusLabel: string;
  goals: string | null;
  sessionMinutes: number;
  totalSessions: number;
  preferredFormat: SessionFormat;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  participants: {
    userId: string;
    role: string;
    status: string;
    isMe: boolean;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  }[];
  progress: {
    sessionsCompleted: number;
    sessionsTotal: number;
    milestonesDone: number;
    milestonesTotal: number;
  };
};

export type ExchangeWorkspace = {
  exchange: {
    id: string;
    title: string;
    status: ExchangeStatus;
    statusLabel: string;
    goals: string | null;
    sessionMinutes: number;
    totalSessions: number;
    preferredFormat: SessionFormat;
    creditValue: number;
    startedAt: string | null;
    completedAt: string | null;
    pausedAt: string | null;
    cancelledAt: string | null;
    cancellationReason: string | null;
    createdAt: string;
    updatedAt: string;
    participants: ExchangeParticipantView[];
  };
  sessions: {
    id: string;
    title: string | null;
    agenda: string | null;
    notes: string | null;
    startsAt: string;
    endsAt: string;
    timezone: string;
    format: SessionFormat;
    meetingUrl: string | null;
    location: string | null;
    status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
    completedAt: string | null;
    cancelledAt: string | null;
    cancellationReason: string | null;
    hostDisplayName: string;
    isMine: boolean;
  }[];
  milestones: {
    id: string;
    title: string;
    description: string | null;
    status: 'PENDING' | 'IN_PROGRESS' | 'DONE';
    dueAt: string | null;
    completedAt: string | null;
    sortOrder: number;
    authorDisplayName: string;
  }[];
  notes: {
    id: string;
    body: string;
    resourceUrl: string | null;
    createdAt: string;
    author: { username: string; displayName: string; avatarUrl: string | null };
  }[];
  timeline: {
    id: string;
    type: string;
    summary: string;
    metadata: unknown;
    createdAt: string;
    actorId: string | null;
  }[];
  requests: { id: string; status: ExchangeStatus; createdAt: string }[];
  permissions: {
    myRole: 'INITIATOR' | 'RECIPIENT';
    myParticipantStatus: string;
    availableActions: ('start' | 'pause' | 'resume' | 'complete' | 'cancel')[];
    canConfirmCompletion: boolean;
    myCompletionConfirmed: boolean;
    bothConfirmed: boolean;
  };
  progress: {
    sessionsCompleted: number;
    sessionsScheduled: number;
    sessionsTotal: number;
    milestonesDone: number;
    milestonesTotal: number;
    percent: number;
  };
  reviews: {
    mine: { id: string; rating: number; comment: string | null } | null;
    theirs: { id: string; rating: number; comment: string | null } | null;
    canReview: boolean;
  };
};

export type CalendarSession = {
  id: string;
  title: string | null;
  agenda: string | null;
  notes: string | null;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  timezone: string;
  format: SessionFormat;
  meetingUrl: string | null;
  location: string | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  isMine: boolean;
  host: { id: string; username: string; displayName: string; avatarUrl: string | null };
  exchange: {
    id: string;
    title: string;
    status: ExchangeStatus;
    participants: { userId: string; username: string; displayName: string; avatarUrl: string | null }[];
  };
};

export type Conversation = {
  id: string;
  isGroup: boolean;
  title: string;
  otherUser: { username: string; displayName: string; avatarUrl: string | null } | null;
  lastMessage: { id: string; preview: string; createdAt: string; fromMe: boolean } | null;
  lastMessageAt: string;
  unreadCount: number;
  muted: boolean;
  exchangeId: string | null;
};

export type ChatMessage = {
  id: string;
  body: string | null;
  removed: boolean;
  fromMe: boolean;
  sender: { username: string; displayName: string; avatarUrl: string | null };
  attachment: { url: string; name: string | null; type: string | null } | null;
  createdAt: string;
};

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  metadata?: unknown;
};

export type CommunityPostSummary = {
  id: string;
  title: string;
  excerpt: string;
  postType: 'DISCUSSION' | 'QUESTION' | 'RESOURCE';
  resourceUrl: string | null;
  pinned: boolean;
  voteCount: number;
  commentCount: number;
  createdAt: string;
  author: { username: string; displayName: string; avatarUrl: string | null };
  category: { id: string; name: string; slug: string } | null;
  skill: { id: string; name: string; slug: string } | null;
  myVote: number;
};

export type CommunityCommentItem = {
  id: string;
  body: string;
  parentId: string | null;
  isAnswer: boolean;
  voteCount: number;
  createdAt: string;
  isMine: boolean;
  author: { username: string; displayName: string; avatarUrl: string | null };
  myVote: number;
  replies?: CommunityCommentItem[];
};

export type CommunityPostDetail = {
  post: Omit<CommunityPostSummary, 'excerpt'> & { body: string; isMine: boolean; updatedAt: string };
  comments: CommunityCommentItem[];
};

export type PlatformStats = {
  members: number;
  skills: number;
  categories: number;
  completedExchanges: number;
  activeExchanges: number;
  reviews: number;
  averageRating: number | null;
  communityPosts: number;
  source: string;
};

export type DashboardPayload = {
  greeting: { displayName: string; username: string };
  completion: Completion;
  skills: {
    teaches: { id: string; level: SkillLevel; name: string; slug: string; category: string }[];
    wants: { id: string; level: SkillLevel; name: string; slug: string; category: string }[];
  };
  requests: {
    incoming: {
      id: string;
      status: ExchangeStatus;
      message: string | null;
      createdAt: string;
      from: { username: string; displayName: string; avatarUrl: string | null };
      offeredSkill: string | null;
      requestedSkill: string | null;
    }[];
    outgoing: {
      id: string;
      status: ExchangeStatus;
      createdAt: string;
      to: { username: string; displayName: string; avatarUrl: string | null };
    }[];
  };
  upcomingSessions: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    format: SessionFormat;
    meetingUrl: string | null;
    host: string;
    exchange: { id: string; title: string };
  }[];
  activeExchanges: {
    id: string;
    title: string;
    status: ExchangeStatus;
    goals: string | null;
    myStatus: string;
    updatedAt: string;
    partner: { username: string; displayName: string; avatarUrl: string | null } | null;
    progress: { sessionsTotal: number; milestonesTotal: number };
  }[];
  recommendations: {
    userId: string;
    username: string;
    score: number;
    reasons: string[];
    displayName: string;
    avatarUrl: string | null;
    headline: string | null;
  }[];
  messages: {
    unread: number;
    recent: {
      conversationId: string;
      with: { username: string; displayName: string; avatarUrl: string | null } | null;
      preview: string;
      createdAt: string;
      fromMe: boolean;
    }[];
  };
  notifications: { unread: number; recent: NotificationItem[] };
  activity: {
    series: { date: string; label: string; count: number }[];
    messagesSentSeries: { date: string; label: string; count: number }[];
    learningMinutesThisWeek: number;
    completedSessionsThisWeek: number;
  };
  exchangeBreakdown: { status: ExchangeStatus; count: number }[];
  reputation: { completedExchanges: number; reviewsCount: number; averageRating: number | null };
};

export type LearningPayload = {
  summary: {
    activeExchanges: number;
    completedExchanges: number;
    totalSessionsCompleted: number;
    totalMilestonesDone: number;
    totalLearningMinutes: number;
    totalLearningHours: number;
  };
  exchanges: {
    exchangeId: string;
    title: string;
    status: ExchangeStatus;
    goals: string | null;
    myStatus: string;
    startedAt: string | null;
    completedAt: string | null;
    partner: { username: string; displayName: string; avatarUrl: string | null } | null;
    iTeach: { id: string; name: string; slug: string } | null;
    iLearn: { id: string; name: string; slug: string } | null;
    progress: {
      sessionsCompleted: number;
      sessionsTotal: number;
      sessionsRecorded: number;
      milestonesDone: number;
      milestonesTotal: number;
      learningMinutes: number;
      learningHours: number;
      percent: number;
    };
    milestones: { id: string; title: string; status: string; dueAt: string | null; completedAt: string | null }[];
    recentSessions: { id: string; title: string | null; startsAt: string; completedAt: string | null; minutes: number }[];
    notes: { id: string; body: string; resourceUrl: string | null; createdAt: string }[];
  }[];
  paths: {
    skill: { id: string; name: string; slug: string; category: { name: string } } | null;
    exchanges: number;
    completedExchanges: number;
    sessionsCompleted: number;
    learningMinutes: number;
    learningHours: number;
    percent: number;
  }[];
  weeklyActivity: { weekStart: string; label: string; sessions: number; minutes: number }[];
};

export type AdminOverview = {
  users: { total: number; active: number; pendingVerification: number; suspended: number; newLast30Days: number };
  exchanges: { total: number; byStatus: Record<string, number> };
  activity: { sessionsScheduled: number; messages: number; communityPosts: number };
  moderation: { openReports: number };
  reviews: { total: number; averageRating: number | null };
  taxonomy: { skills: number; categories: number };
  signupSeries: { date: string; count: number }[];
  generatedAt: string;
};

export type AdminReport = {
  id: string;
  targetType: string;
  targetId: string | null;
  reason: string;
  details: string | null;
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';
  actionTaken: string;
  resolutionNote: string | null;
  createdAt: string;
  handledAt: string | null;
  reporter: { username: string; displayName: string };
  targetUser: { id: string; username: string; displayName: string } | null;
  excerpt: string | null;
};

export type AdminUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
  status: AccountStatus;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  counts: { exchanges: number; posts: number; reportsAgainst: number };
};

export type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; username: string; role: Role } | null;
};

export type SettingsPayload = {
  account: {
    id: string;
    email: string;
    username: string;
    role: Role;
    status: AccountStatus;
    emailVerified: boolean;
    memberSince: string;
  };
  profile: Profile | null;
  preferences: Preferences;
  sessions: {
    id: string;
    userAgent: string | null;
    ipAddress: string | null;
    lastUsedAt: string;
    createdAt: string;
    current: boolean;
  }[];
  blockedCount: number;
  emailDelivery: { provider: string };
};

export type FaqCategory = { category: string; items: { q: string; a: string }[] };

export type IntegrationStatus = {
  emailDelivery: { provider: string; enabled: boolean };
  objectStorage: { provider: string };
  realtime: { provider: string; enabled: boolean };
  aiAssistance: { provider: string; enabled: boolean };
  oauthProviders: string[];
};

export type AvailabilityWindow = {
  weekday: number;
  startMinute: number;
  endMinute: number;
  format: SessionFormat;
};
