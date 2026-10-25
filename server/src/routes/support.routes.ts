import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody } from '../lib/http';
import { created, ok } from '../lib/respond';
import { optionalAuthenticate } from '../middleware/auth';
import { writeLimiter } from '../middleware/errors';
import { emailDeliveryEnabled, sendMail } from '../services/email.service';
import { env } from '../config/env';

export const supportRouter = Router();

/**
 * FAQ content is static, curated copy maintained in this file. It is served from
 * the API so the answers stay in one place. None of it makes legal or compliance
 * claims the platform cannot substantiate.
 */
const FAQS = [
  {
    category: 'Getting started',
    items: [
      {
        q: 'What is SkillSpring?',
        a: 'SkillSpring is a peer-to-peer skills exchange. You teach something you know well and learn something you want to learn, matched with another member who wants the opposite.',
      },
      {
        q: 'Does it cost anything?',
        a: 'No payment is required for a direct swap. Both members exchange their own time, so neither pays the other. Any credit system is a bookkeeping convenience, not a marketplace fee.',
      },
      {
        q: 'Do I need to verify my email?',
        a: 'Yes. Verification confirms you control the address on the account. Until you verify, you can browse and edit your profile but cannot send requests, message members or post in the community.',
      },
    ],
  },
  {
    category: 'Exchanges',
    items: [
      {
        q: 'How does an exchange progress?',
        a: 'A request starts as PENDING. The recipient can accept it (ACCEPTED), decline it, or send a counter-proposal. Once accepted the exchange becomes ACTIVE, and either member can pause or complete it. Completed exchanges can be reviewed.',
      },
      {
        q: 'What if we disagree about the terms?',
        a: 'The recipient of a request can send a counter-proposal with different skills, session length or frequency. The original requester then accepts or declines that counter-proposal.',
      },
      {
        q: 'Can I be in more than one exchange at a time?',
        a: 'Yes. The only limit is your own schedule. Scheduling checks for clashes against every member of the exchange before a session is booked.',
      },
      {
        q: 'How are learning partners recommended?',
        a: 'Recommendations come from a deterministic scoring formula based on reciprocal skills, shared languages, timezone proximity, availability overlap and review history. Each score shows its component breakdown, so you can see exactly why someone was suggested. No machine-learning model is involved.',
      },
    ],
  },
  {
    category: 'Sessions and scheduling',
    items: [
      {
        q: 'How do timezones work?',
        a: 'Every session stores its own timezone. Your availability windows are interpreted in your profile timezone, and the calendar renders times in the timezone you select.',
      },
      {
        q: 'What happens if a session is cancelled?',
        a: 'Cancelling records the reason, keeps the session in the history with a CANCELLED status, and notifies the other member. Completed sessions are kept as part of your learning history and cannot be deleted.',
      },
    ],
  },
  {
    category: 'Privacy and safety',
    items: [
      {
        q: 'Who can see my email address?',
        a: 'Never publicly. Email addresses are not returned by any public profile or directory endpoint. Messaging happens inside the platform.',
      },
      {
        q: 'How do I report someone?',
        a: 'Use the report action on a message, review, or community post, or send a report through the support form. Reports go to the moderation queue where staff review the content and record the outcome.',
      },
      {
        q: 'How do I block someone?',
        a: 'Blocking is available from a member profile or a conversation. Blocking hides you from each other in discovery and stops new messages and exchange requests in both directions.',
      },
      {
        q: 'Can I export or delete my data?',
        a: 'Yes. Settings → Export personal data produces a JSON file with everything stored about your account. Settings → Delete account removes the account and its owned content permanently, after a password confirmation and an explicit typed confirmation.',
      },
    ],
  },
  {
    category: 'Platform limitations',
    items: [
      {
        q: 'Are sessions recorded or proctored?',
        a: 'No. SkillSpring coordinates sessions but does not host, record or supervise them. Meeting links are whatever you and your partner agree to use.',
      },
      {
        q: 'Does the platform handle payments?',
        a: 'No. There is no payment processing. The credit value on an exchange is a simple bookkeeping number and carries no monetary value.',
      },
      {
        q: 'Is there an AI feature?',
        a: 'Matching is deterministic arithmetic, not AI. Optional AI assistance for suggestions can be enabled by an operator by configuring an API key, and the endpoint reports clearly when it is not configured.',
      },
    ],
  },
];

supportRouter.get(
  '/faq',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search ?? '').trim().toLowerCase();

    const categories = FAQS.map((c) => ({
      category: c.category,
      items: search
        ? c.items.filter(
            (i) => i.q.toLowerCase().includes(search) || i.a.toLowerCase().includes(search),
          )
        : c.items,
    })).filter((c) => c.items.length > 0);

    return ok(res, { categories, totalQuestions: FAQS.reduce((n, c) => n + c.items.length, 0) });
  }),
);

/** GET /api/support/status — which optional integrations are live. */
supportRouter.get(
  '/status',
  asyncHandler(async (_req, res) =>
    ok(res, {
      emailDelivery: { provider: env.EMAIL_PROVIDER, enabled: emailDeliveryEnabled() },
      objectStorage: { provider: env.STORAGE_PROVIDER },
      realtime: { provider: 'socket.io', enabled: true },
      aiAssistance: { provider: env.AI_PROVIDER, enabled: env.aiEnabled },
      oauthProviders: [],
    }),
  ),
);

const ticketSchema = z.object({
  name: z.string().trim().min(2, 'Tell us your name.').max(80),
  email: z.string().trim().email('Enter a valid email address.').max(254),
  subject: z.string().trim().min(4, 'Add a short subject.').max(160),
  message: z.string().trim().min(20, 'Please describe the issue in a little more detail.').max(4000),
});

/** POST /api/support/contact — server-validated support form. */
supportRouter.post(
  '/contact',
  writeLimiter,
  optionalAuthenticate,
  validateBody(ticketSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof ticketSchema>;

    const ticket = await prisma.supportTicket.create({
      data: {
        userId: req.user?.id ?? null,
        name: body.name,
        email: body.email.toLowerCase(),
        subject: body.subject,
        message: body.message,
      },
      select: { id: true, status: true, createdAt: true },
    });

    // Acknowledgement email; failure to send never fails the request.
    await sendMail({
      to: body.email.toLowerCase(),
      subject: `We received your message — ${body.subject}`,
      text: `Hi ${body.name},\n\nThanks for contacting SkillSpring. Your reference is ${ticket.id}. A member of the team will reply to this address.\n\nYour message:\n${body.message}`,
    });

    return created(res, {
      reference: ticket.id,
      status: ticket.status,
      createdAt: ticket.createdAt,
      message: 'Thanks — your message has been logged and a reference number was created.',
    });
  }),
);
