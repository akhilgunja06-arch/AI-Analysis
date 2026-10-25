import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  BellOff,
  Flag,
  Info,
  MessageSquare,
  MoreVertical,
  Search,
  Send,
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
  useReportContent,
  useSendMessage,
  useThread,
  useUnreadCount,
} from '@/hooks/queries';
import { useRealtime } from '@/providers/RealtimeProvider';
import { ApiError } from '@/lib/api';
import { cn, relativeTime } from '@/lib/utils';
import type { ChatMessage } from '@/lib/types';

export default function MessagesPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const realtime = useRealtime();

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [draft, setDraft] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('HARASSMENT');
  const [reportDetails, setReportDetails] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);

  const { data: conversations, isLoading: loadingList, isError: listError, error: listErr, refetch: refetchList } =
    useConversations(debounced);
  const { data: unread } = useUnreadCount();

  const thread = useThread(conversationId);
  const sendMessage = useSendMessage();
  const blockUser = useBlockUser();
  const reportContent = useReportContent();

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const activeConversation = useMemo(
    () => (conversations ?? []).find((conversation) => conversation.id === conversationId),
    [conversations, conversationId],
  );

  const messages: ChatMessage[] = useMemo(() => {
    if (!thread.data) return [];
    // Pages arrive newest-first; reverse so oldest is rendered at the top.
    return thread.data.pages.flatMap((page) => page.data).slice().reverse();
  }, [thread.data]);

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
                    {activeConversation ? (
                      (() => {
                        const other = activeConversation.otherUser;
                        return (
                          <>
                            <Avatar
                              name={other?.displayName ?? 'Member'}
                              src={other?.avatarUrl}
                              seed={other?.username}
                              size="md"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{other?.displayName ?? 'Member'}</p>
                              <p className="truncate text-xs ss-subtle">@{other?.username}</p>
                            </div>
                          </>
                        );
                      })()
                    ) : (
                      <p className="text-sm font-semibold">Conversation</p>
                    )}
                  </div>

                  {activeConversation ? (
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
                            to={`/members/${activeConversation.otherUser?.username}`}
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
                              toast.info('Muted', 'You will stop receiving notifications for this conversation.');
                            }}
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[rgb(var(--ss-border)/0.55)]"
                          >
                            <BellOff className="h-4 w-4" aria-hidden="true" />
                            Mute notifications
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setActionsOpen(false);
                              setReportOpen(true);
                            }}
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[rgb(var(--ss-border)/0.55)]"
                          >
                            <Flag className="h-4 w-4" aria-hidden="true" />
                            Report conversation
                          </button>
                          <div className="my-1 h-px bg-[rgb(var(--ss-border))]" />
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              const username = activeConversation.otherUser?.username;
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
                  ) : null}
                </div>

                {/* Messages */}
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
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
                                  'inline-block whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm',
                                  isMine
                                    ? 'rounded-br-sm bg-brand-600 text-white'
                                    : 'rounded-bl-sm border bg-[rgb(var(--ss-bg-alt))]',
                                )}
                              >
                                {message.body}
                              </div>
                              <p className="mt-1 text-[11px] ss-subtle">
                                {relativeTime(message.createdAt)}
                                
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
                    <textarea
                      ref={inputRef}
                      className="ss-input max-h-32 min-h-[44px] flex-1 resize-y"
                      placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
                      value={draft}
                      maxLength={4000}
                      aria-label="Message text"
                      onChange={(event) => setDraft(event.target.value)}
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
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report this conversation"
        description="Reports go to the moderation queue with the relevant messages attached."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReportOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={reportContent.isPending}
              onClick={() => {
                if (!conversationId) return;
                reportContent.mutate(
                  {
                    targetType: 'CONVERSATION',
                    targetId: conversationId,
                    reason: reportReason,
                    details: reportDetails.trim() || undefined,
                  },
                  {
                    onSuccess: () => {
                      toast.success('Report submitted', 'A moderator will review it.');
                      setReportOpen(false);
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
              { value: 'SCAM', label: 'Attempted scam or fraud' },
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
