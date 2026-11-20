import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Calculator,
  Code2,
  Copy,
  FlaskConical,
  GraduationCap,
  Languages,
  Lightbulb,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingState, NotConfiguredState } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { MarkdownMessage } from '@/components/ai/MarkdownMessage';
import {
  useAiConversation,
  useAiConversations,
  useCreateAiConversation,
  useDeleteAiConversation,
  useAiConnectionStatus,
  useIntegrationStatus,
  useRetryAiMessage,
  useSendAiMessage,
} from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { cn, relativeTime } from '@/lib/utils';
import type { AiConversation } from '@/lib/types';

/**
 * The AI Study Assistant.
 *
 * Deliberately separate from member-to-member chat: it has its own conversation
 * store, its own moderation surface and its own navigation entry.
 *
 * The page never pretends the model answered. When GROQ_API_KEY is not set the
 * server answers 501 AI_NOT_CONFIGURED, and that is shown as a configuration
 * notice rather than as a reply.
 */

const STARTERS = [
  { icon: Calculator, label: 'Explain integration by parts with a worked example' },
  { icon: Code2, label: 'Why do I get "TypeError: undefined is not a function" in JavaScript?' },
  { icon: FlaskConical, label: 'What is the difference between ionic and covalent bonding?' },
  { icon: Languages, label: 'సంక్లిష్ట సంఖ్యలు అంటే ఏమిటి? ఉదాహరణ ఇవ్వండి' },
  { icon: Lightbulb, label: 'Give me 5 practice questions on Newton\'s laws with answers' },
  { icon: GraduationCap, label: 'Make a 7-day revision plan for my physics exam' },
];

export default function AssistantPage() {
  const toast = useToast();
  const { data: conversations, isLoading: loadingList, isError, error, refetch } = useAiConversations();
  const { data: integrations } = useIntegrationStatus();
  const createConversation = useCreateAiConversation();
  const deleteConversation = useDeleteAiConversation();
  const sendMessage = useSendAiMessage();
  const retryMessage = useRetryAiMessage();

  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AiConversation | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  const thread = useAiConversation(activeId);
  const aiEnabled = integrations?.aiAssistance.enabled ?? false;
  const modelName = integrations?.aiAssistance.model ?? null;
  // A live probe, so a rejected key is distinguishable from a missing one.
  const connection = useAiConnectionStatus(aiEnabled);
  const connectionCode = connection.data?.code ?? null;
  const connectionFailed = aiEnabled && connection.isSuccess && !connection.data?.ok;

  useEffect(() => {
    if (activeId === undefined && conversations && conversations.length > 0) {
      setActiveId(conversations[0].id);
    }
  }, [activeId, conversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.data?.messages.length, sendMessage.isPending]);

  const startConversation = async (): Promise<string | undefined> => {
    try {
      const res = await createConversation.mutateAsync(undefined);
      setActiveId(res.data.id);
      return res.data.id;
    } catch (err) {
      toast.error('Could not start a conversation', err instanceof ApiError ? err.message : undefined);
      return undefined;
    }
  };

  const send = async (content: string) => {
    const text = content.trim();
    if (!text || sendMessage.isPending) return;
    setSendError(null);
    setNotice(null);

    const conversationId = activeId ?? (await startConversation());
    if (!conversationId) return;

    setDraft('');
    try {
      const result = await sendMessage.mutateAsync({ conversationId, content: text });
      if (result.data.notice) setNotice(result.data.notice);
    } catch (err) {
      // Every failure is surfaced; none is swallowed.
      setSendError(
        err instanceof ApiError ? err.message : 'We could not reach the study assistant. Please try again.',
      );
    }
  };

  const retry = async () => {
    if (!activeId) return;
    setSendError(null);
    try {
      await retryMessage.mutateAsync(activeId);
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'We could not regenerate the answer.');
    }
  };

  const removeConversation = async () => {
    if (!confirmDelete) return;
    try {
      await deleteConversation.mutateAsync(confirmDelete.id);
      if (activeId === confirmDelete.id) setActiveId(undefined);
      toast.success('Conversation deleted', 'It has been removed from your history.');
    } catch (err) {
      toast.error('Could not delete', err instanceof ApiError ? err.message : undefined);
    } finally {
      setConfirmDelete(null);
    }
  };

  const messages = thread.data?.messages ?? [];
  const lastIsAssistant = messages.length > 0 && messages[messages.length - 1].role === 'ASSISTANT';

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-brand text-white shadow-lg shadow-brand-600/25">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="ss-heading-page">AI Study Assistant</h1>
            <p className="mt-1.5 max-w-2xl ss-muted">
              Ask about maths, science, programming, English or exam preparation. Answers arrive as
              step-by-step explanations with examples, and code is formatted for reading.
              {modelName ? (
                <span className="ml-1 inline-flex items-center rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  {modelName}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => void startConversation()}
            loading={createConversation.isPending}
            leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
          >
            New chat
          </Button>
        </div>
      </div>

      {connectionFailed ? (
        <div className="mt-6">
          <NotConfiguredState
            title="The assistant is configured but the provider refused the request"
            description={
              <>
                {connection.data?.message} Reported code:{' '}
                <code className="font-mono">{connectionCode}</code>. The model is{' '}
                <code className="font-mono">{connection.data?.model}</code>. Check the server log for the
                upstream status. This page never invents an answer.
              </>
            }
            integration={connectionCode ?? 'AI_API_KEY'}
          />
        </div>
      ) : null}

      {!aiEnabled ? (
        <div className="mt-6">
          <NotConfiguredState
            title="The AI Study Assistant is not configured on this deployment"
            description={
              <>
                You can start a conversation and your questions are saved, but no answer will be generated
                until the server has a Groq API key. Set <code className="font-mono">AI_API_KEY</code> (and
                optionally <code className="font-mono">AI_MODEL</code>) in{' '}
                <code className="font-mono">server/.env</code>, then restart the API. The older{' '}
                <code className="font-mono">GROQ_API_KEY</code> name also works. This page never invents an
                answer.
              </>
            }
            integration="AI_API_KEY"
          />
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[17rem_1fr]">
        {/* History */}
        <Card className="overflow-hidden">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Your study chats</h2>
          </div>
          {loadingList ? (
            <div className="p-4">
              <LoadingState label="Loading conversations" />
            </div>
          ) : isError ? (
            <div className="p-4">
              <ErrorState error={error} onRetry={() => void refetch()} compact />
            </div>
          ) : !conversations || conversations.length === 0 ? (
            <div className="p-4">
              <EmptyState compact title="No study chats yet" description="Start one and it will appear here." />
            </div>
          ) : (
            <ul className="max-h-[30rem] divide-y overflow-y-auto">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <div
                    className={cn(
                      'flex items-center gap-2 px-3 py-3 transition-colors',
                      activeId === conversation.id
                        ? 'bg-brand-50 dark:bg-brand-500/12'
                        : 'hover:bg-[rgb(var(--ss-border)/0.4)]',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveId(conversation.id)}
                      className="min-w-0 flex-1 text-left"
                      aria-current={activeId === conversation.id ? 'true' : undefined}
                    >
                      <p className="truncate text-sm font-medium">{conversation.title}</p>
                      <p className="mt-0.5 text-xs ss-subtle">
                        {conversation.messageCount} {conversation.messageCount === 1 ? 'message' : 'messages'} ·{' '}
                        {relativeTime(conversation.updatedAt)}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(conversation)}
                      aria-label={`Delete conversation ${conversation.title}`}
                      className="rounded-lg p-1.5 text-[rgb(var(--ss-text-subtle))] transition-colors hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Thread */}
        <Card className="flex min-h-[34rem] flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {!activeId ? (
              <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand-soft text-brand-600 dark:text-brand-300">
                  <Sparkles className="h-7 w-7" aria-hidden="true" />
                </span>
                <h2 className="font-display text-base font-semibold">What are you studying today?</h2>
                <p className="mt-2 max-w-md text-sm ss-muted">
                  Ask a question, request an explanation, or pick a starting point.
                </p>
                <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                  {STARTERS.map((starter) => {
                    const Icon = starter.icon;
                    return (
                      <button
                        key={starter.label}
                        type="button"
                        onClick={() => void send(starter.label)}
                        className="flex items-start gap-2 rounded-xl border p-3 text-left text-sm transition-colors hover:border-[rgb(var(--ss-ring))] hover:bg-[rgb(var(--ss-border)/0.35)]"
                      >
                        <Icon
                          className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400"
                          aria-hidden="true"
                        />
                        <span>{starter.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : thread.isLoading ? (
              <LoadingState label="Loading conversation" />
            ) : thread.isError ? (
              <ErrorState error={thread.error} onRetry={() => void thread.refetch()} />
            ) : messages.length === 0 ? (
              <EmptyState compact title="This chat is empty" description="Send your first question below." />
            ) : (
              <>
                {messages.map((message) => {
                  const fromUser = message.role === 'USER';
                  return (
                    <div key={message.id} className={cn('flex gap-2.5', fromUser ? 'flex-row-reverse' : 'flex-row')}>
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white',
                          fromUser ? 'bg-brand-600' : 'bg-gradient-brand',
                        )}
                        aria-hidden="true"
                      >
                        {fromUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </span>
                      <div
                        className={cn(
                          'min-w-0 max-w-[85%] rounded-2xl px-3.5 py-2.5',
                          fromUser
                            ? 'bg-brand-600 text-white'
                            : 'border bg-[rgb(var(--ss-bg-alt))] text-[rgb(var(--ss-text))]',
                        )}
                      >
                        {fromUser ? (
                          <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
                        ) : (
                          <MarkdownMessage content={message.content} />
                        )}
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className={cn('text-[10px]', fromUser ? 'text-white/70' : 'ss-subtle')}>
                            {relativeTime(message.createdAt)}
                          </span>
                          {!fromUser ? (
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard
                                  .writeText(message.content)
                                  .then(() => toast.success('Copied', 'The answer is on your clipboard.'));
                              }}
                              className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] ss-subtle transition-colors hover:bg-[rgb(var(--ss-border)/0.6)] hover:text-[rgb(var(--ss-text))]"
                              aria-label="Copy answer"
                            >
                              <Copy className="h-3 w-3" aria-hidden="true" />
                              Copy
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {sendMessage.isPending ? (
                  <div className="flex gap-2.5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-white"
                      aria-hidden="true"
                    >
                      <Bot className="h-4 w-4" />
                    </span>
                    <div className="rounded-2xl border bg-[rgb(var(--ss-bg-alt))] px-3.5 py-3">
                      <span className="flex items-center gap-1.5" aria-label="The assistant is thinking">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500 [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500 [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500" />
                      </span>
                    </div>
                  </div>
                ) : null}

                {lastIsAssistant && !sendMessage.isPending ? (
                  <div className="pl-10">
                    <button
                      type="button"
                      onClick={() => void retry()}
                      disabled={retryMessage.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ss-muted transition-colors hover:bg-[rgb(var(--ss-border)/0.4)]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      {retryMessage.isPending ? 'Regenerating…' : 'Regenerate answer'}
                    </button>
                  </div>
                ) : null}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {notice ? (
            <div className="mx-4 mb-2 rounded-lg border border-amber-500/40 bg-amber-50/70 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/5 dark:text-amber-300">
              {notice}
            </div>
          ) : null}

          {sendError ? (
            <div
              role="alert"
              className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-50/70 px-3 py-2 text-xs text-rose-800 dark:bg-rose-500/5 dark:text-rose-300"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <div className="flex-1">{sendError}</div>
              {activeId ? (
                <button
                  type="button"
                  onClick={() => void retry()}
                  className="shrink-0 font-medium underline underline-offset-2"
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="border-t p-3">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send(draft);
              }}
              className="flex items-end gap-2"
            >
              <label htmlFor="assistant-draft" className="sr-only">
                Ask the study assistant a question
              </label>
              <textarea
                id="assistant-draft"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void send(draft);
                  }
                }}
                rows={1}
                maxLength={8000}
                placeholder="Ask a study question… (Enter to send, Shift+Enter for a new line)"
                className="ss-input min-h-[44px] max-h-40 flex-1 resize-y"
              />
              <Button
                type="submit"
                loading={sendMessage.isPending}
                disabled={!draft.trim()}
                rightIcon={<Send className="h-4 w-4" aria-hidden="true" />}
              >
                Send
              </Button>
            </form>
            <p className="mt-2 text-[11px] ss-subtle">
              The assistant answers study questions only. It cannot browse the internet and never invents
              citations.
            </p>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this conversation?"
        description="This removes the conversation and all of its messages. This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleteConversation.isPending}
        onConfirm={() => void removeConversation()}
        onClose={() => setConfirmDelete(null)}
      />
    </PageContainer>
  );
}
