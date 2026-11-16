import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Compass,
  Lightbulb,
  Mic,
  MicOff,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingState, NotConfiguredState } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import {
  useAiConversation,
  useAiConversations,
  useCreateAiConversation,
  useDeleteAiConversation,
  useIntegrationStatus,
  useSendAiMessage,
} from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { cn, relativeTime } from '@/lib/utils';
import type { AiConversation } from '@/lib/types';

const STARTERS = [
  { icon: Compass, label: 'How does a skill exchange work?' },
  { icon: Lightbulb, label: 'Suggest a four-week plan to learn React' },
  { icon: Sparkles, label: 'What should I put in my profile to get better matches?' },
  { icon: Bot, label: 'Explain how the match score is calculated' },
];

/** Minimal typings for the browser speech APIs, which are not in lib.dom. */
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function AssistantPage() {
  const toast = useToast();
  const { data: conversations, isLoading: loadingList, isError, error, refetch } = useAiConversations();
  const { data: integrations } = useIntegrationStatus();
  const createConversation = useCreateAiConversation();
  const deleteConversation = useDeleteAiConversation();
  const sendMessage = useSendAiMessage();

  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AiConversation | null>(null);
  const [listening, setListening] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const thread = useAiConversation(activeId);
  const aiEnabled = integrations?.aiAssistance.enabled ?? false;

  // Select the most recent conversation once the list has loaded.
  useEffect(() => {
    if (activeId === undefined && conversations && conversations.length > 0) {
      setActiveId(conversations[0].id);
    }
  }, [activeId, conversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.data?.messages.length]);

  const stopListening = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  };

  const toggleListening = () => {
    if (listening) {
      stopListening();
      return;
    }
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      toast.warning('Voice input unavailable', 'This browser does not support speech recognition.');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setDraft((current) => (current ? `${current} ${transcript}` : transcript));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      toast.error('Voice input stopped', 'We could not capture any speech. Please try again.');
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

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
    if (!text) return;
    setSendError(null);
    const conversationId = activeId ?? (await startConversation());
    if (!conversationId) return;

    setDraft('');
    try {
      await sendMessage.mutateAsync({ conversationId, content: text });
      // A successful call means a provider answered; speak it if requested.
      if (speakReplies) speak('Reply received.');
    } catch (err) {
      if (err instanceof ApiError && (err.isNotImplemented || err.code === 'AI_NOT_CONFIGURED')) {
        // The message was saved; only the reply is unavailable. Not a failure to hide.
        setSendError(err.message);
      } else {
        setSendError(err instanceof ApiError ? err.message : 'We could not send that message.');
      }
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

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="ss-heading-page flex items-center gap-2">
            <Bot className="h-6 w-6 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            Assistant
          </h1>
          <p className="mt-2 max-w-2xl ss-muted">
            Ask about how SkillSpring works, get ideas for what to learn, or plan a study schedule. Your
            conversations are private to your account.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSpeakReplies((v) => !v)}
            leftIcon={
              speakReplies ? (
                <Volume2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <VolumeX className="h-4 w-4" aria-hidden="true" />
              )
            }
            aria-pressed={speakReplies}
          >
            {speakReplies ? 'Voice replies on' : 'Voice replies off'}
          </Button>
          <Button
            size="sm"
            onClick={() => void startConversation()}
            loading={createConversation.isPending}
            leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
          >
            New conversation
          </Button>
        </div>
      </div>

      {!aiEnabled ? (
        <div className="mt-6">
          <NotConfiguredState
            title="The assistant is not configured on this deployment"
            description={
              <>
                You can still create conversations and save messages, but no reply will be generated until an
                AI provider is set on the server. Set <code className="font-mono">AI_PROVIDER</code>,{' '}
                <code className="font-mono">AI_API_KEY</code> and <code className="font-mono">AI_MODEL</code> to
                enable it. This page never fabricates a reply.
              </>
            }
            integration="AI_PROVIDER"
          />
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[18rem_1fr]">
        {/* Conversation list */}
        <Card className="overflow-hidden">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Your conversations</h2>
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
              <EmptyState
                compact
                title="No conversations yet"
                description="Start one and it will appear here."
              />
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
                        {conversation.messageCount}{' '}
                        {conversation.messageCount === 1 ? 'message' : 'messages'} ·{' '}
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

        {/* Conversation pane */}
        <Card className="flex min-h-[32rem] flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {!activeId ? (
              <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand-soft text-brand-600 dark:text-brand-300">
                  <Sparkles className="h-7 w-7" aria-hidden="true" />
                </span>
                <h2 className="font-display text-base font-semibold">Ask the assistant anything</h2>
                <p className="mt-2 max-w-sm text-sm ss-muted">
                  Pick a starting point below, or type your own question.
                </p>
                <div className="mt-6 grid w-full max-w-lg gap-2 sm:grid-cols-2">
                  {STARTERS.map((starter) => {
                    const Icon = starter.icon;
                    return (
                      <button
                        key={starter.label}
                        type="button"
                        onClick={() => void send(starter.label)}
                        className="flex items-start gap-2 rounded-xl border p-3 text-left text-sm transition-colors hover:border-[rgb(var(--ss-ring))] hover:bg-[rgb(var(--ss-border)/0.35)]"
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
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
              <EmptyState
                compact
                title="This conversation is empty"
                description="Send the first message below."
              />
            ) : (
              <>
                {messages.map((message) => {
                  const fromUser = message.role === 'USER';
                  return (
                    <div
                      key={message.id}
                      className={cn('flex gap-2.5', fromUser ? 'flex-row-reverse' : 'flex-row')}
                    >
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white',
                          fromUser ? 'bg-brand-600' : 'bg-gradient-brand',
                        )}
                        aria-hidden="true"
                      >
                        {fromUser ? <span className="text-xs font-semibold">You</span> : <Bot className="h-4 w-4" />}
                      </span>
                      <div
                        className={cn(
                          'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm',
                          fromUser
                            ? 'bg-brand-600 text-white'
                            : 'border bg-[rgb(var(--ss-bg-alt))] text-[rgb(var(--ss-text))]',
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{message.content}</p>
                        <p
                          className={cn(
                            'mt-1 text-[10px]',
                            fromUser ? 'text-white/70' : 'ss-subtle',
                          )}
                        >
                          {relativeTime(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {sendError ? (
            <div
              role="alert"
              className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50/70 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/5 dark:text-amber-300"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{sendError}</span>
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
                Message the assistant
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
                placeholder="Type your question…"
                className="ss-input min-h-[44px] max-h-40 flex-1 resize-y"
              />
              <Button
                type="button"
                variant={listening ? 'danger' : 'secondary'}
                onClick={toggleListening}
                aria-pressed={listening}
                aria-label={listening ? 'Stop voice input' : 'Start voice input'}
                leftIcon={
                  listening ? (
                    <MicOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Mic className="h-4 w-4" aria-hidden="true" />
                  )
                }
              >
                {listening ? 'Stop' : 'Speak'}
              </Button>
              <Button
                type="submit"
                loading={sendMessage.isPending}
                disabled={!draft.trim()}
                rightIcon={<Send className="h-4 w-4" aria-hidden="true" />}
              >
                Send
              </Button>
            </form>
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
