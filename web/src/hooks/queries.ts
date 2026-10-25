import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AdminOverview,
  AdminReport,
  AdminUser,
  AuditEntry,
  CalendarSession,
  Category,
  ChatMessage,
  CommunityCommentItem,
  CommunityPostDetail,
  CommunityPostSummary,
  Conversation,
  DashboardPayload,
  ExchangeRequestItem,
  ExchangeStatus,
  ExchangeSummary,
  ExchangeWorkspace,
  FaqCategory,
  IntegrationStatus,
  LearningPayload,
  Match,
  MatchCriteria,
  MemberProfileResponse,
  NotificationItem,
  PlatformStats,
  PublicMember,
  ReviewItem,
  SettingsPayload,
  Skill,
  SkillDirection,
  TrendingSkill,
  UserSkillEntry,
  AvailabilityWindow,
} from '@/lib/types';

// ------------------------------------------------------------- query keys

export const keys = {
  stats: ['stats'] as const,
  categories: ['skills', 'categories'] as const,
  skills: (search: string, categoryId?: string) => ['skills', 'list', search, categoryId] as const,
  trending: (limit: number) => ['skills', 'trending', limit] as const,
  mySkills: ['skills', 'mine'] as const,
  members: (filters: Record<string, unknown>) => ['members', filters] as const,
  member: (username: string) => ['members', username] as const,
  matches: (filters: Record<string, unknown>) => ['matches', filters] as const,
  requests: (box: string, status?: string) => ['exchanges', 'requests', box, status] as const,
  exchanges: (status?: string) => ['exchanges', 'list', status] as const,
  workspace: (id: string) => ['exchanges', 'workspace', id] as const,
  transitions: ['exchanges', 'transitions'] as const,
  sessions: (filters: Record<string, unknown>) => ['sessions', filters] as const,
  conversations: (search: string) => ['messages', 'conversations', search] as const,
  thread: (id: string) => ['messages', 'thread', id] as const,
  unread: ['messages', 'unread'] as const,
  notifications: (unreadOnly: boolean) => ['notifications', 'list', unreadOnly] as const,
  notificationCount: ['notifications', 'count'] as const,
  pendingReviews: ['reviews', 'pending'] as const,
  memberReviews: (username: string) => ['reviews', 'user', username] as const,
  community: (filters: Record<string, unknown>) => ['community', 'posts', filters] as const,
  post: (id: string) => ['community', 'post', id] as const,
  dashboard: ['dashboard'] as const,
  learning: (scope: string) => ['learning', scope] as const,
  settings: ['settings'] as const,
  faq: (search: string) => ['support', 'faq', search] as const,
  integrationStatus: ['support', 'status'] as const,
  adminOverview: ['admin', 'overview'] as const,
  adminUsers: (filters: Record<string, unknown>) => ['admin', 'users', filters] as const,
  adminReports: (filters: Record<string, unknown>) => ['admin', 'reports', filters] as const,
  adminCategories: ['admin', 'categories'] as const,
  adminAudit: (filters: Record<string, unknown>) => ['admin', 'audit', filters] as const,
};

// ------------------------------------------------------------- public data

export function usePlatformStats() {
  return useQuery({
    queryKey: keys.stats,
    queryFn: () => api.get<PlatformStats>('/stats'),
    staleTime: 60_000,
    select: (res) => res.data,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: keys.categories,
    queryFn: () => api.get<Category[]>('/skills/categories'),
    staleTime: 5 * 60_000,
    select: (res) => res.data,
  });
}

export function useSkillSearch(search: string, categoryId?: string, enabled = true) {
  return useQuery({
    queryKey: keys.skills(search, categoryId),
    queryFn: () => api.get<Skill[]>('/skills', { query: { search, categoryId, limit: 30 } }),
    enabled,
    staleTime: 60_000,
    select: (res) => res.data,
  });
}

export function useTrendingSkills(limit = 8) {
  return useQuery({
    queryKey: keys.trending(limit),
    queryFn: () => api.get<TrendingSkill[]>('/skills/trending', { query: { limit } }),
    staleTime: 60_000,
    select: (res) => res.data,
  });
}

export function useMySkills() {
  return useQuery({
    queryKey: keys.mySkills,
    queryFn: () => api.get<{ teaches: UserSkillEntry[]; wants: UserSkillEntry[] }>('/skills/mine'),
    select: (res) => res.data,
  });
}

// ------------------------------------------------------------- members

export type MemberFilters = {
  search?: string;
  teachesSkillId?: string;
  wantsSkillId?: string;
  language?: string;
  timezone?: string;
  format?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
};

export function useMembers(filters: MemberFilters) {
  return useQuery({
    queryKey: keys.members(filters),
    queryFn: () => api.get<PublicMember[]>('/members', { query: filters as Record<string, string | number> }),
    placeholderData: (previous) => previous,
  });
}

export function useMemberProfile(username: string | undefined) {
  return useQuery({
    queryKey: keys.member(username ?? ''),
    queryFn: () => api.get<MemberProfileResponse>(`/members/${username}`),
    enabled: Boolean(username),
    select: (res) => res.data,
  });
}

// ------------------------------------------------------------- matches

export type MatchFilters = {
  limit?: number;
  minScore?: number;
  requireReciprocal?: boolean;
  language?: string;
  maxTimezoneOffset?: number;
  includeDismissed?: boolean;
};

export function useMatches(filters: MatchFilters) {
  return useQuery({
    queryKey: keys.matches(filters),
    queryFn: () =>
      api.get<{ matches: Match[]; criteria: MatchCriteria; dismissedCount: number }>('/matches', {
        query: {
          limit: filters.limit,
          minScore: filters.minScore,
          requireReciprocal: filters.requireReciprocal,
          language: filters.language,
          maxTimezoneOffset: filters.maxTimezoneOffset,
          includeDismissed: filters.includeDismissed,
        },
      }),
    placeholderData: (previous) => previous,
  });
}

export function useDismissMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.post(`/matches/${userId}/dismiss`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['matches'] });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useRestoreMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.delete(`/matches/${userId}/dismiss`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}

// ------------------------------------------------------------- exchanges

export function useExchangeRequests(box: 'incoming' | 'outgoing' | 'all', status?: ExchangeStatus) {
  return useQuery({
    queryKey: keys.requests(box, status),
    queryFn: () => api.get<ExchangeRequestItem[]>('/exchanges/requests', { query: { box, status, pageSize: 50 } }),
    select: (res) => res.data,
  });
}

export function useExchanges(status?: ExchangeStatus) {
  return useQuery({
    queryKey: keys.exchanges(status),
    queryFn: () => api.get<ExchangeSummary[]>('/exchanges', { query: { status, pageSize: 50 } }),
    select: (res) => res.data,
  });
}

export function useExchangeWorkspace(id: string | undefined) {
  return useQuery({
    queryKey: keys.workspace(id ?? ''),
    queryFn: () => api.get<ExchangeWorkspace>(`/exchanges/${id}`),
    enabled: Boolean(id),
    select: (res) => res.data,
  });
}

export function useExchangeTransitions() {
  return useQuery({
    queryKey: keys.transitions,
    queryFn: () => api.get<{ transitions: Record<string, string[]>; labels: Record<string, string> }>('/exchanges/meta/transitions'),
    staleTime: Infinity,
    select: (res) => res.data,
  });
}

export function useCreateExchangeRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      recipientId: string;
      offeredSkillId?: string | null;
      requestedSkillId?: string | null;
      message?: string;
      goals?: string;
      sessionMinutes?: number;
      sessionsPerWeek?: number;
      totalSessions?: number;
      preferredFormat?: string;
    }) => api.post<ExchangeRequestItem>('/exchanges/requests', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exchanges'] });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useRespondToRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      ...rest
    }: {
      id: string;
      action: 'accept' | 'decline' | 'withdraw' | 'counter';
      reason?: string;
      message?: string;
      sessionMinutes?: number;
      sessionsPerWeek?: number;
      totalSessions?: number;
      preferredFormat?: string;
    }) => api.post<ExchangeRequestItem>(`/exchanges/requests/${id}/respond`, { action, ...rest }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exchanges'] });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useExchangeAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: string; reason?: string }) =>
      api.post<{ status: ExchangeStatus }>(`/exchanges/${id}/actions`, { action, reason }),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: keys.workspace(variables.id) });
      void queryClient.invalidateQueries({ queryKey: ['exchanges'] });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      void queryClient.invalidateQueries({ queryKey: keys.learning('all') });
    },
  });
}

export function useConfirmCompletion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirm }: { id: string; confirm: boolean }) =>
      api.post<{ bothConfirmed: boolean; status: ExchangeStatus }>(`/exchanges/${id}/confirm-completion`, { confirm }),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: keys.workspace(variables.id) });
      void queryClient.invalidateQueries({ queryKey: ['exchanges'] });
    },
  });
}

// ------------------------------------------------------------- milestones & notes

export function useCreateMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ exchangeId, ...body }: { exchangeId: string; title: string; description?: string; dueAt?: string }) =>
      api.post(`/exchanges/${exchangeId}/milestones`, body),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: keys.workspace(variables.exchangeId) });
    },
  });
}

export function useUpdateMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, exchangeId, ...body }: { id: string; exchangeId: string; status?: string; title?: string; description?: string }) =>
      api.patch(`/milestones/${id}`, body),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: keys.workspace(variables.exchangeId) });
      void queryClient.invalidateQueries({ queryKey: ['learning'] });
    },
  });
}

export function useDeleteMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; exchangeId: string }) => api.delete(`/milestones/${id}`),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: keys.workspace(variables.exchangeId) });
    },
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ exchangeId, ...body }: { exchangeId: string; body: string; resourceUrl?: string }) =>
      api.post(`/exchanges/${exchangeId}/notes`, body),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: keys.workspace(variables.exchangeId) });
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; exchangeId: string }) => api.delete(`/notes/${id}`),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: keys.workspace(variables.exchangeId) });
    },
  });
}

// ------------------------------------------------------------- sessions

export type SessionFilters = { from?: string; to?: string; status?: string; exchangeId?: string };

export function useSessions(filters: SessionFilters) {
  return useQuery({
    queryKey: keys.sessions(filters),
    queryFn: () => api.get<CalendarSession[]>('/sessions', { query: { ...filters, pageSize: 100 } }),
    select: (res) => res.data,
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      exchangeId: string;
      startsAt: string;
      durationMinutes: number;
      timezone?: string;
      format?: string;
      meetingUrl?: string;
      location?: string;
      title?: string;
      agenda?: string;
    }) => api.post<CalendarSession>('/sessions', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      void queryClient.invalidateQueries({ queryKey: ['exchanges'] });
    },
  });
}

export function useUpdateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; [key: string]: unknown }) =>
      api.patch<CalendarSession>(`/sessions/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['exchanges'] });
      void queryClient.invalidateQueries({ queryKey: ['learning'] });
    },
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sessions/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['exchanges'] });
    },
  });
}

// ------------------------------------------------------------- messaging

export function useConversations(search = '') {
  return useQuery({
    queryKey: keys.conversations(search),
    queryFn: () => api.get<Conversation[]>('/messages/conversations', { query: { search } }),
    select: (res) => res.data,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: keys.unread,
    queryFn: () => api.get<{ unread: number }>('/messages/unread-count'),
    select: (res) => res.data.unread,
    refetchInterval: 60_000,
  });
}

export function useThread(conversationId: string | undefined) {
  return useInfiniteQuery({
    queryKey: keys.thread(conversationId ?? ''),
    queryFn: ({ pageParam }) =>
      api.get<ChatMessage[]>(`/messages/conversations/${conversationId}`, {
        query: { page: pageParam as number, pageSize: 40 },
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta?.hasNext ? last.meta.page + 1 : undefined),
    enabled: Boolean(conversationId),
  });
}

export function useStartConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { username: string; message?: string }) =>
      api.post<{ conversationId: string }>('/messages/conversations', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, body }: { conversationId: string; body: string }) =>
      api.post<ChatMessage>(`/messages/conversations/${conversationId}`, { body }),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: keys.thread(variables.conversationId) });
      void queryClient.invalidateQueries({ queryKey: ['messages', 'conversations'] });
      void queryClient.invalidateQueries({ queryKey: keys.unread });
    },
  });
}

export function useBlockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ username, reason }: { username: string; reason?: string }) =>
      api.post(`/messages/users/${username}/block`, { reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
      void queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });
}

export function useUnblockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (username: string) => api.delete(`/messages/users/${username}/block`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
      void queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });
}

// ------------------------------------------------------------- notifications

export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: keys.notifications(unreadOnly),
    queryFn: () => api.get<NotificationItem[]>('/notifications', { query: { unreadOnly, pageSize: 50 } }),
    select: (res) => res.data,
    refetchInterval: 60_000,
  });
}

export function useNotificationCount() {
  return useQuery({
    queryKey: keys.notificationCount,
    queryFn: () => api.get<{ unread: number }>('/notifications/unread-count'),
    select: (res) => res.data.unread,
    refetchInterval: 45_000,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id?: string) =>
      id ? api.post(`/notifications/${id}/read`) : api.post('/notifications/read-all'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useClearNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete('/notifications'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// ------------------------------------------------------------- reviews

export function usePendingReviews() {
  return useQuery({
    queryKey: keys.pendingReviews,
    queryFn: () =>
      api.get<{
        pending: {
          exchangeId: string;
          title: string;
          status: string;
          completedAt: string | null;
          otherUser: { id: string; username: string; displayName: string; avatarUrl: string | null } | null;
        }[];
      }>('/reviews/pending'),
    select: (res) => res.data.pending,
  });
}

export function useCreateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      exchangeId: string;
      subjectId: string;
      rating: number;
      teachingRating?: number;
      communicationRating?: number;
      reliabilityRating?: number;
      comment?: string;
    }) => api.post<ReviewItem>('/reviews', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reviews'] });
      void queryClient.invalidateQueries({ queryKey: ['exchanges'] });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useMemberReviews(username: string | undefined) {
  return useQuery({
    queryKey: keys.memberReviews(username ?? ''),
    queryFn: () =>
      api.get<{ reviews: ReviewItem[]; averageRating: number | null; distribution: Record<string, number> }>(
        `/reviews/user/${username}`,
      ),
    enabled: Boolean(username),
    select: (res) => res.data,
  });
}

// ------------------------------------------------------------- community

export type CommunityFilters = {
  search?: string;
  categoryId?: string;
  postType?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
};

export function useCommunityPosts(filters: CommunityFilters) {
  return useQuery({
    queryKey: keys.community(filters),
    queryFn: () => api.get<CommunityPostSummary[]>('/community/posts', { query: filters as Record<string, string | number> }),
    placeholderData: (previous) => previous,
  });
}

export function useCommunityPost(id: string | undefined) {
  return useQuery({
    queryKey: keys.post(id ?? ''),
    queryFn: () => api.get<CommunityPostDetail>(`/community/posts/${id}`),
    enabled: Boolean(id),
    select: (res) => res.data,
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; body: string; postType: string; categoryId?: string; skillId?: string; resourceUrl?: string }) =>
      api.post<CommunityPostSummary>('/community/posts', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['community'] });
      void queryClient.invalidateQueries({ queryKey: keys.stats });
    },
  });
}

export function useVotePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }: { id: string; value: number }) =>
      api.post<{ voteCount: number; myVote: number }>(`/community/posts/${id}/vote`, { value }),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['community'] });
      void queryClient.invalidateQueries({ queryKey: keys.post(variables.id) });
    },
  });
}

export function useCreateComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, body, parentId }: { postId: string; body: string; parentId?: string }) =>
      api.post<CommunityCommentItem>(`/community/posts/${postId}/comments`, { body, parentId }),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: keys.post(variables.postId) });
      void queryClient.invalidateQueries({ queryKey: ['community'] });
    },
  });
}

export function useVoteComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }: { id: string; value: number }) =>
      api.post<{ voteCount: number; myVote: number }>(`/community/comments/${id}/vote`, { value }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['community'] });
    },
  });
}

export function useMarkAnswer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; postId: string }) => api.post(`/community/comments/${id}/answer`),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: keys.post(variables.postId) });
    },
  });
}

export function useReportContent() {
  return useMutation({
    mutationFn: (input: { targetType: string; targetId: string; reason: string; details?: string }) =>
      api.post('/community/report', input),
  });
}

// ------------------------------------------------------------- dashboard & learning

export function useDashboard() {
  return useQuery({
    queryKey: keys.dashboard,
    queryFn: () => api.get<DashboardPayload>('/dashboard'),
    select: (res) => res.data,
    staleTime: 30_000,
  });
}

export function useLearning(scope: 'all' | 'active' | 'completed' = 'all') {
  return useQuery({
    queryKey: keys.learning(scope),
    queryFn: () => api.get<LearningPayload>('/learning', { query: { scope } }),
    select: (res) => res.data,
  });
}

// ------------------------------------------------------------- settings

export function useSettings() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: () => api.get<SettingsPayload>('/settings'),
    select: (res) => res.data,
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.patch<SettingsPayload>('/settings/preferences', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.settings });
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.patch<{ profile: unknown; completion: unknown }>('/profile', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.settings });
      void queryClient.invalidateQueries({ queryKey: keys.mySkills });
    },
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.settings });
    },
  });
}

// ------------------------------------------------------------- support

export function useFaq(search: string) {
  return useQuery({
    queryKey: keys.faq(search),
    queryFn: () => api.get<{ categories: FaqCategory[]; totalQuestions: number }>('/support/faq', { query: { search } }),
    staleTime: 5 * 60_000,
    select: (res) => res.data,
  });
}

export function useIntegrationStatus() {
  return useQuery({
    queryKey: keys.integrationStatus,
    queryFn: () => api.get<IntegrationStatus>('/support/status'),
    staleTime: 5 * 60_000,
    select: (res) => res.data,
  });
}

export function useSubmitSupportTicket() {
  return useMutation({
    mutationFn: (input: { name: string; email: string; subject: string; message: string }) =>
      api.post<{ reference: string; message: string }>('/support/contact', input),
  });
}

// ------------------------------------------------------------- admin

export type AdminUserFilters = {
  search?: string;
  role?: string;
  status?: string;
  page?: number;
  pageSize?: number;
};

export function useAdminOverview() {
  return useQuery({
    queryKey: keys.adminOverview,
    queryFn: () => api.get<AdminOverview>('/admin/overview'),
    select: (res) => res.data,
    refetchInterval: 120_000,
  });
}

export function useAdminUsers(filters: AdminUserFilters) {
  return useQuery({
    queryKey: keys.adminUsers(filters),
    queryFn: () => api.get<AdminUser[]>('/admin/users', { query: filters as Record<string, string | number> }),
    placeholderData: (previous) => previous,
  });
}

export function useAdminUserAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; action: string; reason?: string; role?: string }) =>
      api.patch(`/admin/users/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useAdminReports(filters: { status?: string; targetType?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: keys.adminReports(filters),
    queryFn: () => api.get<AdminReport[]>('/admin/reports', { query: filters as Record<string, string | number> }),
    placeholderData: (previous) => previous,
  });
}

export function useResolveReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status: string; action?: string; note?: string }) =>
      api.patch(`/admin/reports/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      void queryClient.invalidateQueries({ queryKey: ['community'] });
    },
  });
}

export function useAdminCategories() {
  return useQuery({
    queryKey: keys.adminCategories,
    queryFn: () => api.get<Category[]>('/admin/categories'),
    select: (res) => res.data,
  });
}

export function useAdminCategoryMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin'] });
    void queryClient.invalidateQueries({ queryKey: keys.categories });
  };

  const create = useMutation({
    mutationFn: (input: { name: string; description?: string; icon?: string; color?: string; sortOrder?: number }) =>
      api.post<Category>('/admin/categories', input),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; description?: string; isActive?: boolean }) =>
      api.patch<Category>(`/admin/categories/${id}`, body),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/categories/${id}`),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

export function useAdminAuditLogs(filters: { action?: string; entityType?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: keys.adminAudit(filters),
    queryFn: () => api.get<AuditEntry[]>('/admin/audit-logs', { query: filters as Record<string, string | number> }),
    placeholderData: (previous) => previous,
  });
}

// ------------------------------------------------------------- availability

export function useAvailability() {
  return useQuery({
    queryKey: ['profile', 'availability'],
    queryFn: () => api.get<{ windows: AvailabilityWindow[] }>('/profile/availability'),
    select: (res) => res.data.windows,
  });
}

export function useSaveAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (windows: AvailabilityWindow[]) => api.put('/profile/availability', { windows }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile', 'availability'] });
      void queryClient.invalidateQueries({ queryKey: keys.mySkills });
    },
  });
}

export function useToggleFollow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ username, follow }: { username: string; follow: boolean }) =>
      follow ? api.post(`/members/${username}/follow`) : api.delete(`/members/${username}/follow`),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: keys.member(variables.username) });
      void queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });
}

export function useAddSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      skillId: string;
      direction: SkillDirection;
      level: string;
      description?: string;
      outcomes?: string;
      portfolioUrl?: string;
    }) => api.post<UserSkillEntry>('/skills/mine', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.mySkills });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      void queryClient.invalidateQueries({ queryKey: ['matches'] });
      void queryClient.invalidateQueries({ queryKey: ['profile', 'onboarding'] });
    },
  });
}

export function useUpdateSkillEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; [key: string]: unknown }) =>
      api.patch<UserSkillEntry>(`/skills/mine/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.mySkills });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useRemoveSkillEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/skills/mine/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.mySkills });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      void queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}

export function useOnboardingProgress() {
  return useQuery({
    queryKey: ['profile', 'onboarding'],
    queryFn: () => api.get<{ completion: { percent: number; missing: string[] }; onboarding: unknown }>('/profile/onboarding'),
    select: (res) => res.data,
  });
}

export function useSaveOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { step?: number; completed?: boolean }) => api.patch('/profile/onboarding', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile', 'onboarding'] });
    },
  });
}

/** Used to type-narrow generic query results in components. */
export type QueryResult<T> = UseQueryOptions<T> & { data?: T };
