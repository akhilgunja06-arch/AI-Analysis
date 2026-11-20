import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  BellOff,
  BellRing,
  Check,
  CheckCheck,
  Flag,
  ImagePlus,
  Info,
  MessageSquare,
  MoreVertical,
  Phone,
  Search,
  Send,
  Trash2,
  UserPlus,
  Video,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { SelectField, TextAreaField } from '@/components/ui/Field';
import { EmptyState, ErrorState, LoadingState, SkeletonRows } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import {
  useBlockUser,
  useConversations,
  useDeleteMessage,
  useMarkConversationRead,
  useMessageableUsers,
  useMuteConversation,
  useReportContent,
  useSendAttachment,
  useSendMessage,
  useStartConversation,
  useThread,
  useUnreadCount,
} from '@/hooks/queries';
import { useAuth } from '@/providers/AuthProvider';
import { useRealtime } from '@/providers/RealtimeProvider';
import { useCall } from '@/providers/CallProvider';
import { ApiError } from '@/lib/api';
import { cn, relativeTime } from '@/lib/utils';
import type { ChatMessage, ChatPeer, MessageableUser } from '@/lib/types';

export default function MessagesPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const realtime = useRealtime();
  const { user } = useAuth();
  const { startCall, inCall, starting: callStarting } = useCall();

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [draft, setDraft] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: 'USER' | 'MESSAGE'; id: string } | null>(null);
  const [reportReason, setReportReason] = useState('HARASSMENT');
  const [reportDetails, setReportDetails] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findTerm, setFindTerm] = useState('');
  const [findDebounced, setFindDebounced] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);

  const { data: conversations, isLoading: loadingList, isError: listError, error: listErr, refetch: refetchList } =
    useConversations(debounced);
  const { data: unread } = useUnreadCount();
  const { data: foundUsers, isFetching: searchingUsers } = useMessageableUsers(findDebounced);

  const thread = useThread(conversationId);
  const sendMessage = useSendMessage();
  const sendAttachment = useSendAttachment();
  const deleteMessage = useDeleteMessage();
  const muteConversation = useMuteConversation();
  // `mutate` is stable across renders, so the socket listener below is attached
  // once per conversation rather than on every render.
  const markRead = useMarkConversationRead().mutate;
  const startConversation = useStartConversation();
  const blockUser = useBlockUser();
  const reportContent = useReportContent();

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingSentAt = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => setFindDebounced(findTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [findTerm]);

  const activeConversation = useMemo(
    () => (conversations ?? []).find((conversation) => conversation.id === conversationId),
    [conversations, conversationId],
  );

  const messages: ChatMessage[] = useMemo(() => {
    if (!thread.data) return [];
    // Pages arrive newest-first; reverse so oldest is rendered at the top.
    return thread.data.pages.flatMap((page) => page.data).slice().reverse();
  }, [thread.data]);

  // The peer of the open thread, from the conversation list or the thread meta.
  const peer: ChatPeer | null =
    activeConversation?.otherUser ??
    (thread.data?.pages[0]?.meta?.otherUser as ChatPeer | undefined) ??
    null;

  // The realtime provider already invalidates the thread and list caches when a
  // message arrives, so the only thing left is to make sure the socket is
  // subscribed to this conversation's room.
  useEffect(() => {
    if (!conversationId) return;
    realtime.socket?.emit('conversation:join', { conversationId });
    return () => {
      realtime.socket?.emit('conversation:leave', { conversationId });
    };
  }, [conversationId, realtime.socket]);

  // Typing indicators are relayed by the server only to the other participants.
  useEffect(() => {
    const socket = realtime.socket;
    if (!socket) return;
    const onTyping = (payload: { conversationId?: string; username?: string; typing?: boolean }) => {
      if (payload?.conversationId !== conversationId) return;
      setPeerTyping(Boolean(payload.typing));
    };
    socket.on('typing', onTyping);
    return () => {
      socket.off('typing', onTyping);
      setPeerTyping(false);
    };
  }, [realtime.socket, conversationId]);

  const notifyTyping = () => {
    if (!conversationId || !realtime.socket) return;
    const now = Date.now();
    // One event every two seconds is enough to keep the indicator alive without
    // flooding the socket on every keystroke.
    if (now - typingSentAt.current < 2000) return;
    typingSentAt.current = now;
    realtime.socket.emit('typing', { conversationId, typing: true });
  };

  // A message that arrives while the thread is open is read immediately, so the
  // sender's ticks turn blue and the open conversation shows no unread badge.
  useEffect(() => {
    if (!conversationId || !realtime.socket) return;
    const onNew = (payload: { conversationId?: string; message?: { senderId?: string } }) => {
      if (payload?.conversationId !== conversationId) return;
      setPeerTyping(false);
      if (payload.message?.senderId !== user?.id) markRead(conversationId);
    };
    realtime.socket.on('message:new', onNew);
    return () => {
      realtime.socket?.off('message:new', onNew);
    };
  }, [conversationId, realtime.socket, user?.id, markRead]);

  // Scroll to the newest message when the thread or conversation changes.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, conversationId]);

  // Focus the composer when opening a thread on a large screen.
  useEffect(() => {
    if (conversationId && window.innerWidth >= 1024) inputRef.current?.focus();
  }, [conversationId]);

  const submit = () => {
    if (!conversationId || draft.trim().length === 0) return;
    const body = draft.trim();
    setDraft('');
    sendMessage.mutate(
      { conversationId, body },
      {
        onError: (err) => {
          setDraft(body);
          toast.error('Message not sent', err instanceof ApiError ? err.message : 'Please try again.');
        },
      },
    );
  };

  return (
    <PageContainer size="wide" className="py-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="ss-heading-page">Messages</h1>
          <p className="mt-1 text-sm ss-muted">
            {unread && unread > 0 ? `${unread} unread` : 'All caught up'}
          </p>
        </div>
        <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => setFindOpen(true)}
          leftIcon={<UserPlus className="h-4 w-4" aria-hidden="true" />}
        >
          Find someone
        </Button>
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium',
            realtime.connected
              ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
              : 'border-amber-500/40 text-amber-600 dark:text-amber-400',
          )}
          title={
            realtime.connected
              ? 'Live updates are connected'
              : 'Live updates are unavailable; messages still send and refresh on reload'
          }
        >
          {realtime.connected ? (
            <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {realtime.connected ? 'Live' : 'Offline'}
        </div>
        </div>
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="grid lg:grid-cols-[20rem_1fr]">
          {/* ------------------------------------------- conversation list */}
          <div
            className={cn(
              'border-b lg:border-b-0 lg:border-r',
              conversationId && 'hidden lg:block',
            )}
          >
            <div className="border-b p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--ss-text-subtle))]" aria-hidden="true" />
                <input
                  type="search"
                  className="ss-input pl-10 text-sm"
                  placeholder="Search conversations…"
                  value={search}
                  aria-label="Search conversations"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>

            <div className="max-h-[32rem] overflow-y-auto lg:max-h-[38rem]">
              {loadingList ? (
                <div className="p-3">
                  <SkeletonRows count={5} />
                </div>
              ) : listError ? (
                <div className="p-4">
                  <ErrorState error={listErr} onRetry={() => void refetchList()} compact />
                </div>
              ) : (conversations ?? []).length === 0 ? (
                <div className="p-6 text-center">
                  <MessageSquare className="mx-auto h-7 w-7 ss-subtle" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium">
                    {debounced ? 'No conversations match' : 'No conversations yet'}
                  </p>
                  <p className="mt-1 text-xs ss-muted">
                    {debounced
                      ? 'Try a different search.'
                      : 'Message a member from their profile, or from an exchange workspace.'}
                  </p>
                  {!debounced ? (
                    <Link to="/members" className="mt-3 inline-block">
                      <Button size="sm" variant="secondary">
                        Find members
                      </Button>
                    </Link>
                  ) : null}
                </div>
              ) : (
                <ul className="divide-y">
                  {(conversations ?? []).map((conversation) => {
                    const other = conversation.otherUser;
                    const isActive = conversation.id === conversationId;
                    return (
                      <li key={conversation.id}>
                        <Link
                          to={`/messages/${conversation.id}`}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'flex items-start gap-3 p-3.5 transition-colors',
                            isActive ? 'bg-brand-50/70 dark:bg-brand-500/10' : 'hover:bg-[rgb(var(--ss-border)/0.35)]',
                          )}
                        >
                          <Avatar
                            name={other?.displayName ?? 'Member'}
                            src={other?.avatarUrl}
                            seed={other?.username}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p
                                className={cn(
                                  'truncate text-sm',
                                  conversation.unreadCount > 0 ? 'font-semibold' : 'font-medium',
                                )}
                              >
                                {other?.displayName ?? 'Member'}
                              </p>
                              {conversation.lastMessage ? (
                                <span className="shrink-0 text-[11px] ss-subtle">
                                  {relativeTime(conversation.lastMessage.createdAt)}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2">
                              <p
                                className={cn(
                                  'truncate text-xs',
                                  conversation.unreadCount > 0 ? 'ss-muted' : 'ss-subtle',
                                )}
                              >
                                {conversation.lastMessage
                                  ? `${conversation.lastMessage.fromMe ? 'You: ' : ''}${conversation.lastMessage.preview}`
                                  : 'No messages yet'}
                              </p>
                              {conversation.unreadCount > 0 ? (
                                <span className="ml-auto shrink-0 rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                                  {conversation.unreadCount}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* --------------------------------------------------- thread */}
          <div className={cn('flex min-h-[32rem] flex-col lg:min-h-[38rem]', !conversationId && 'hidden lg:flex')}>
            {!conversationId ? (
              <div className="flex flex-1 items-center justify-center p-8">
                <EmptyState
                  icon={<MessageSquare className="h-7 w-7" aria-hidden="true" />}
                  title="Pick a conversation"
                  description="Choose someone from the list to read and reply to your messages."
                />
              </div>
            ) : thread.isLoading ? (
              <div className="flex-1 p-6">
                <LoadingState label="Loading messages" />
              </div>
            ) : thread.isError ? (
              <div className="flex-1 p-6">
                <ErrorState error={thread.error} onRetry={() => void thread.refetch()} />
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div className="flex items-center justify-between gap-3 border-b p-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <Link
                      to="/messages"
                      className="rounded-lg p-1.5 text-[rgb(var(--ss-text-subtle))] lg:hidden"
                      aria-label="Back to conversations"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    {peer ? (
                      <>
                        <div className="relative">
                          <Avatar name={peer.displayName} src={peer.avatarUrl} seed={peer.username} size="md" />
                          <span
                            className={cn(
                              'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[rgb(var(--ss-bg))]',
                              peer.online ? 'bg-emerald-500' : 'bg-slate-400',
                            )}
                            aria-hidden="true"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{peer.displayName}</p>
                          <p className="truncate text-xs ss-subtle">
                            {peerTyping ? (
                              <span className="text-brand-600 dark:text-brand-300">typing…</span>
                            ) : peer.online ? (
                              'Online now'
                            ) : peer.lastSeenAt ? (
                              `Last seen ${relativeTime(peer.lastSeenAt)}`
                            ) : (
                              `@${peer.username}`
                            )}
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm font-semibold">Conversation</p>
                    )}
                  </div>

                  {peer ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          peer && void startCall(peer.username, 'AUDIO')
                        }
                        disabled={inCall || callStarting || !peer}
                        className="rounded-lg border p-2 transition-colors hover:border-[rgb(var(--ss-ring))] disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`Start an audio call with ${peer?.displayName ?? 'this member'}`}
                      >
                        <Phone className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          peer && void startCall(peer.username, 'VIDEO')
                        }
                        disabled={inCall || callStarting || !peer}
                        className="rounded-lg border p-2 transition-colors hover:border-[rgb(var(--ss-ring))] disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`Start a video call with ${peer?.displayName ?? 'this member'}`}
                      >
                        <Video className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <div className="relative">
                      <button
                        type="button"
                        onClick={() => setActionsOpen((v) => !v)}
                        aria-haspopup="menu"
                        aria-expanded={actionsOpen}
                        aria-label="Conversation options"
                        className="rounded-lg border p-2 transition-colors hover:border-[rgb(var(--ss-ring))]"
                      >
                        <MoreVertical className="h-4 w-4" aria-hidden="true" />
                      </button>
                      {actionsOpen ? (
                        <div
                          role="menu"
                          className="absolute right-0 z-30 mt-1.5 w-52 overflow-hidden rounded-xl border bg-[rgb(var(--ss-bg-alt))] p-1 shadow-xl"
                        >
                          <Link
                            to={`/members/${peer?.username}`}
                            role="menuitem"
                            onClick={() => setActionsOpen(false)}
                            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[rgb(var(--ss-border)/0.55)]"
                          >
                            <Info className="h-4 w-4" aria-hidden="true" />
                            View profile
                          </Link>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setActionsOpen(false);
                              if (!conversationId) return;
                              const nextMuted = !(activeConversation?.muted ?? false);
                              muteConversation.mutate(
                                { conversationId, muted: nextMuted },
                                {
                                  onSuccess: () =>
                                    toast.success(
                                      nextMuted ? 'Muted' : 'Unmuted',
                                      nextMuted
                                        ? 'You will stop receiving notifications for this conversation.'
                                        : 'You will be notified about new messages again.',
                                    ),
                                  onError: (err) =>
                                    toast.error('Could not update', err instanceof ApiError ? err.message : undefined),
                                },
                              );
                            }}
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[rgb(var(--ss-border)/0.55)]"
                          >
                            {activeConversation?.muted ? (
                              <BellRing className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <BellOff className="h-4 w-4" aria-hidden="true" />
                            )}
                            {activeConversation?.muted ? 'Unmute notifications' : 'Mute notifications'}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setActionsOpen(false);
                              if (peer) setReportTarget({ type: 'USER', id: peer.id });
                              setReportOpen(true);
                            }}
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[rgb(var(--ss-border)/0.55)]"
                          >
                            <Flag className="h-4 w-4" aria-hidden="true" />
                            Report member
                          </button>
                          <div className="my-1 h-px bg-[rgb(var(--ss-border))]" />
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              const username = peer?.username;
                              setActionsOpen(false);
                              if (!username) return;
                              blockUser.mutate(
                                { username },
                                {
                                  onSuccess: () => {
                                    toast.success('Blocked', 'You will no longer exchange messages.');
                                    navigate('/messages');
                                  },
                                },
                              );
                            }}
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                          >
                            <Ban className="h-4 w-4" aria-hidden="true" />
                            Block this member
                          </button>
                        </div>
                      ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Messages */}
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {thread.hasNextPage ? (
                    <div className="pb-1 text-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={thread.isFetchingNextPage}
                        onClick={() => void thread.fetchNextPage()}
                      >
                        Load older messages
                      </Button>
                    </div>
                  ) : null}
                  {messages.length === 0 ? (
                    <EmptyState
                      compact
                      icon={<MessageSquare className="h-6 w-6" aria-hidden="true" />}
                      title="No messages yet"
                      description="Say hello and mention what you would like to learn or teach."
                    />
                  ) : (
                    messages.map((message, index) => {
                      const isMine = message.fromMe;
                      const previous = messages[index - 1];
                      const showDay =
                        !previous ||
                        new Date(previous.createdAt).toDateString() !==
                          new Date(message.createdAt).toDateString();

                      return (
                        <div key={message.id}>
                          {showDay ? (
                            <p className="my-3 text-center text-[11px] font-medium ss-subtle">
                              {new Date(message.createdAt).toLocaleDateString(undefined, {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long',
                              })}
                            </p>
                          ) : null}
                          <div className={cn('flex gap-2.5', isMine && 'flex-row-reverse')}>
                            {!isMine ? (
                              <Avatar
                                name={message.sender.displayName}
                                src={message.sender.avatarUrl}
                                seed={message.sender.username}
                                size="sm"
                              />
                            ) : null}
                            <div className={cn('max-w-[75%]', isMine && 'text-right')}>
                              <div
                                className={cn(
                                  'inline-block max-w-full whitespace-pre-line break-words rounded-2xl px-3.5 py-2.5 text-left text-sm',
                                  isMine
                                    ? 'rounded-br-sm bg-brand-600 text-white'
                                    : 'rounded-bl-sm border bg-[rgb(var(--ss-bg-alt))]',
                                )}
                              >
                                {message.attachment ? (
                                  <a
                                    href={message.attachment.url}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="block"
                                  >
                                    {message.attachment.type?.startsWith('image/') ? (
                                      <img
                                        src={message.attachment.url}
                                        alt={message.attachment.name ?? 'Shared image'}
                                        className="mb-1.5 max-h-64 w-full rounded-lg object-cover"
                                        loading="lazy"
                                      />
                                    ) : null}
                                    <span className="inline-flex items-center gap-1.5 underline underline-offset-2">
                                      {message.attachment.name ?? 'Attachment'}
                                    </span>
                                  </a>
                                ) : null}
                                {message.body ? <span>{message.body}</span> : null}
                                {message.removed ? (
                                  <span className="italic opacity-80">This message was removed by a moderator.</span>
                                ) : null}
                                {message.deleted ? (
                                  <span className="italic opacity-80">This message was deleted.</span>
                                ) : null}
                              </div>
                              <p className="mt-1 flex items-center justify-end gap-2 text-[11px] ss-subtle">
                                <span>{relativeTime(message.createdAt)}</span>
                                {isMine && !message.removed && !message.deleted ? (
                                  message.readAt ? (
                                    <span className="inline-flex items-center gap-1" title="Read">
                                      <CheckCheck className="h-3 w-3 text-brand-600 dark:text-brand-300" aria-hidden />
                                      <span className="sr-only">Read</span>
                                    </span>
                                  ) : message.deliveredAt ? (
                                    <span className="inline-flex items-center gap-1" title="Delivered">
                                      <CheckCheck className="h-3 w-3" aria-hidden />
                                      <span className="sr-only">Delivered</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1" title="Sent">
                                      <Check className="h-3 w-3" aria-hidden />
                                      <span className="sr-only">Sent</span>
                                    </span>
                                  )
                                ) : null}
                                {isMine && !message.deleted ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      deleteMessage.mutate(
                                        { messageId: message.id, conversationId: conversationId! },
                                        {
                                          onError: (err) =>
                                            toast.error(
                                              'Could not delete',
                                              err instanceof ApiError ? err.message : undefined,
                                            ),
                                        },
                                      )
                                    }
                                    className="inline-flex items-center gap-1 hover:text-rose-600"
                                    aria-label="Delete this message"
                                  >
                                    <Trash2 className="h-3 w-3" aria-hidden />
                                  </button>
                                ) : null}
                                {!isMine && !message.removed && !message.deleted ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReportTarget({ type: 'MESSAGE', id: message.id });
                                      setReportOpen(true);
                                    }}
                                    className="inline-flex items-center gap-1 hover:text-brand-600"
                                    aria-label="Report this message"
                                  >
                                    <Flag className="h-3 w-3" aria-hidden />
                                    Report
                                  </button>
                                ) : null}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={bottomRef} />
                </div>

                {/* Composer */}
                <div className="border-t p-3">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      submit();
                    }}
                    className="flex items-end gap-2"
                  >
                    <input
                      ref={fileRef}
                      type="file"
                      className="hidden"
                      accept="image/*,application/pdf,.doc,.docx,.txt,.zip"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        if (!file || !conversationId) return;
                        sendAttachment.mutate(
                          { conversationId, file },
                          {
                            onError: (err) =>
                              toast.error(
                                'Could not send the file',
                                err instanceof ApiError ? err.message : undefined,
                              ),
                          },
                        );
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={sendAttachment.isPending}
                      className="rounded-lg border p-2.5 transition-colors hover:border-[rgb(var(--ss-ring))] disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Attach a file"
                    >
                      <ImagePlus className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <textarea
                      ref={inputRef}
                      className="ss-input max-h-32 min-h-[44px] flex-1 resize-y"
                      placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
                      value={draft}
                      maxLength={4000}
                      aria-label="Message text"
                      onChange={(event) => {
                        setDraft(event.target.value);
                        notifyTyping();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          submit();
                        }
                      }}
                    />
                    <Button
                      type="submit"
                      loading={sendMessage.isPending}
                      disabled={draft.trim().length === 0}
                      aria-label="Send message"
                      leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
                    >
                      Send
                    </Button>
                  </form>
                  <p className="mt-1.5 text-[11px] ss-subtle">
                    {draft.length > 0 ? `${draft.length}/4000 · ` : ''}
                    Messages are only visible to the two people in this conversation.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      <Modal
        open={findOpen}
        onClose={() => {
          setFindOpen(false);
          setFindTerm('');
        }}
        title="Start a conversation"
        description="Search for a member by username or name, then open a private chat."
        size="md"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--ss-text-subtle))]"
              aria-hidden="true"
            />
            <input
              type="search"
              className="ss-input pl-10"
              placeholder="Search by username or name…"
              value={findTerm}
              aria-label="Search members"
              autoFocus
              onChange={(event) => setFindTerm(event.target.value)}
            />
          </div>

          {findDebounced.length < 2 ? (
            <p className="text-sm ss-muted">Type at least two characters to search.</p>
          ) : searchingUsers ? (
            <LoadingState label="Searching" />
          ) : (foundUsers ?? []).length === 0 ? (
            <p className="text-sm ss-muted">Nobody matches that search. Check the spelling, or try a username.</p>
          ) : (
            <ul className="max-h-80 divide-y overflow-y-auto">
              {(foundUsers ?? []).map((user: MessageableUser) => (
                <li key={user.id} className="flex items-center gap-3 py-2.5">
                  <Avatar name={user.displayName} src={user.avatarUrl} seed={user.username} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{user.displayName}</p>
                    <p className="truncate text-xs ss-subtle">
                      @{user.username}
                      {user.headline ? ` · ${user.headline}` : ''}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={user.conversationId ? 'secondary' : 'primary'}
                    loading={startConversation.isPending}
                    onClick={() => {
                      if (user.conversationId) {
                        setFindOpen(false);
                        navigate(`/messages/${user.conversationId}`);
                        return;
                      }
                      startConversation.mutate(
                        { username: user.username },
                        {
                          onSuccess: (res) => {
                            setFindOpen(false);
                            setFindTerm('');
                            navigate(`/messages/${res.data.conversationId}`);
                          },
                          onError: (err) =>
                            toast.error(
                              'Could not start the conversation',
                              err instanceof ApiError ? err.message : undefined,
                            ),
                        },
                      );
                    }}
                  >
                    {user.conversationId ? 'Open chat' : 'Message'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <Modal
        open={reportOpen}
        onClose={() => {
          setReportOpen(false);
          setReportTarget(null);
        }}
        title={reportTarget?.type === 'MESSAGE' ? 'Report this message' : 'Report this member'}
        description="Reports go to the moderation queue. A moderator can read the conversation you share with this member."
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setReportOpen(false);
                setReportTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={reportContent.isPending}
              disabled={!reportTarget}
              onClick={() => {
                if (!reportTarget) return;
                reportContent.mutate(
                  {
                    targetType: reportTarget.type,
                    targetId: reportTarget.id,
                    reason: reportReason,
                    details: reportDetails.trim() || undefined,
                  },
                  {
                    onSuccess: () => {
                      toast.success('Report submitted', 'A moderator will review it.');
                      setReportOpen(false);
                      setReportTarget(null);
                      setReportDetails('');
                    },
                    onError: (err) =>
                      toast.error('Could not submit', err instanceof ApiError ? err.message : undefined),
                  },
                );
              }}
            >
              Submit report
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField
            label="Reason"
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value)}
            options={[
              { value: 'HARASSMENT', label: 'Harassment or abuse' },
              { value: 'SPAM', label: 'Spam or advertising' },
              { value: 'INAPPROPRIATE_CONTENT', label: 'Inappropriate content' },
              { value: 'OTHER', label: 'Something else' },
            ]}
          />
          <TextAreaField
            label="What happened?"
            value={reportDetails}
            onChange={(event) => setReportDetails(event.target.value)}
            maxLength={2000}
            showCount
          />
        </div>
      </Modal>
    </PageContainer>
  );
}
