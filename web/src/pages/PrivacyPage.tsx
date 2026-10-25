import { Link } from 'react-router-dom';
import { LegalShell } from './legal/LegalShell';

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy policy"
      summary="This explains what SkillSpring stores about you, why it stores it, who can see it, and how to get it back or have it removed. It describes what this software actually does — no more and no less."
      lastUpdated="24 October 2026"
      otherLink={{ to: '/terms', label: 'Read the terms of use' }}
      sections={[
        {
          id: 'who',
          heading: 'Who runs this service',
          body: (
            <>
              <p>
                SkillSpring is a peer-to-peer skill exchange platform. It is an independent project and is not
                affiliated with, endorsed by, or connected to any other professional network.
              </p>
              <p>
                For any privacy question, or to exercise any of the rights described below, contact us through
                the{' '}
                <Link to="/help#contact" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
                  help centre
                </Link>
                .
              </p>
            </>
          ),
        },
        {
          id: 'what',
          heading: 'What we store',
          body: (
            <>
              <p>We store the following categories of information:</p>
              <ul className="ml-5 list-disc space-y-2">
                <li>
                  <strong className="text-[rgb(var(--ss-text))]">Account data.</strong> Your email address,
                  username, and a securely hashed password. We never store your password in a readable form.
                </li>
                <li>
                  <strong className="text-[rgb(var(--ss-text))]">Profile data.</strong> Display name, headline,
                  biography, avatar, location, timezone, languages, links you choose to add, and your preferred
                  session format.
                </li>
                <li>
                  <strong className="text-[rgb(var(--ss-text))]">Skills and availability.</strong> The skills
                  you teach and want to learn, your level in each, and the weekly time windows you are
                  available.
                </li>
                <li>
                  <strong className="text-[rgb(var(--ss-text))]">Exchange records.</strong> Requests you send
                  and receive, agreed terms, sessions, milestones, shared notes and the status history of each
                  exchange.
                </li>
                <li>
                  <strong className="text-[rgb(var(--ss-text))]">Messages.</strong> The content of conversations
                  you take part in.
                </li>
                <li>
                  <strong className="text-[rgb(var(--ss-text))]">Reviews.</strong> Ratings and written feedback
                  you give and receive, tied to a specific completed exchange.
                </li>
                <li>
                  <strong className="text-[rgb(var(--ss-text))]">Community content.</strong> Posts, replies and
                  votes you make in the community area.
                </li>
                <li>
                  <strong className="text-[rgb(var(--ss-text))]">Session and security records.</strong> Sign-in
                  sessions with an approximate device description, and an audit log of administrative actions.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'why',
          heading: 'Why we store it',
          body: (
            <>
              <p>Each category exists for a specific purpose:</p>
              <ul className="ml-5 list-disc space-y-2">
                <li>Account and profile data lets you sign in and lets other members know who they are dealing with.</li>
                <li>Skills and availability drive the matching engine and the member directory.</li>
                <li>Exchange records are the shared record both participants rely on; without them there is no way to track progress or resolve a disagreement.</li>
                <li>Messages let you arrange and conduct sessions.</li>
                <li>Reviews create accountability between members, which is why they are tied to completed exchanges.</li>
                <li>Session and audit records let you review access to your account and let moderation be accountable.</li>
              </ul>
              <p>
                We do not use your data for advertising, and we do not sell it to anyone.
              </p>
            </>
          ),
        },
        {
          id: 'visible',
          heading: 'What other people can see',
          body: (
            <>
              <p>Some of your information is public by design, and some is private:</p>
              <ul className="ml-5 list-disc space-y-2">
                <li>
                  <strong className="text-[rgb(var(--ss-text))]">Public:</strong> your username, display name,
                  headline, biography, avatar, the skills you teach and want to learn, your reviews, and your
                  completed exchange count. Your location, languages, availability and completed exchange count
                  can each be hidden in your privacy settings.
                </li>
                <li>
                  <strong className="text-[rgb(var(--ss-text))]">Never public:</strong> your email address,
                  password, session records and audit records.
                </li>
                <li>
                  <strong className="text-[rgb(var(--ss-text))]">Shared only with participants:</strong>{' '}
                  messages, shared notes, session details and meeting links. Meeting links are visible only to
                  the two people in that exchange.
                </li>
                <li>
                  <strong className="text-[rgb(var(--ss-text))]">Moderators:</strong> can see content that has
                  been reported, together with the report. They cannot browse private conversations without a
                  report.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'control',
          heading: 'Your control over your data',
          body: (
            <>
              <p>You can:</p>
              <ul className="ml-5 list-disc space-y-2">
                <li>Change or clear any profile field at any time from your settings.</li>
                <li>Turn your public profile off entirely, which removes you from the directory and search.</li>
                <li>
                  Download a JSON export of everything we hold about you, from{' '}
                  <Link to="/settings" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
                    settings
                  </Link>
                  . Passwords and session tokens are excluded from the export.
                </li>
                <li>Revoke any signed-in session individually.</li>
                <li>Deactivate your account, which hides it and signs you out everywhere. Signing in again reactivates it.</li>
                <li>
                  Delete your account permanently. This removes your profile, skills, availability, messages and
                  preferences.
                </li>
              </ul>
              <p>
                One thing worth understanding before you delete: completed exchanges are anonymised rather than
                destroyed. Your former partners keep their own learning history, which is theirs as much as
                yours. Reviews you wrote remain, attributed to a deleted member.
              </p>
            </>
          ),
        },
        {
          id: 'retention',
          heading: 'How long we keep things',
          body: (
            <>
              <p>
                Active data is kept for as long as your account exists. When you delete your account, personal
                identifying details are removed promptly, while anonymised exchange and review records are
                retained so other members' histories stay intact.
              </p>
              <p>
                Security and audit records are retained for a limited period so that access can be reviewed and
                moderation decisions can be explained.
              </p>
            </>
          ),
        },
        {
          id: 'security',
          heading: 'How we protect it',
          body: (
            <>
              <ul className="ml-5 list-disc space-y-2">
                <li>Passwords are stored only as secure hashes, never in readable form.</li>
                <li>Access tokens are short-lived and refresh tokens are stored hashed and rotated on use.</li>
                <li>
                  Every request that touches private data is authorised on the server. Hiding a button in the
                  interface is never the only protection.
                </li>
                <li>Conversations are checked for membership on every request, so one member cannot read another's messages.</li>
                <li>Administrative actions on accounts, content and the skill taxonomy are written to an audit log.</li>
                <li>Input is validated on the server, and rate limits apply to authentication and content creation.</li>
              </ul>
              <p>
                No system is perfectly secure. If you believe you have found a vulnerability, please tell us
                through the help centre rather than exploiting it.
              </p>
            </>
          ),
        },
        {
          id: 'third-parties',
          heading: 'Third-party services',
          body: (
            <>
              <p>
                Depending on how an operator has configured the deployment, optional services may be used for
                email delivery, file storage, live updates, and optional AI assistance. The{' '}
                <Link to="/help" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
                  help centre
                </Link>{' '}
                shows exactly which of these are configured on the deployment you are using, and which are not.
              </p>
              <p>
                Where a service is not configured, the corresponding feature either works locally or is
                disabled, and the interface says so rather than pretending otherwise.
              </p>
            </>
          ),
        },
        {
          id: 'children',
          heading: 'Age requirement',
          body: (
            <p>
              SkillSpring is intended for adults. You must be at least 18 years old to create an account. We do
              not knowingly collect information from anyone under that age; if you believe a minor has
              registered, contact us and we will remove the account.
            </p>
          ),
        },
        {
          id: 'changes',
          heading: 'Changes to this policy',
          body: (
            <p>
              If this policy changes in a way that affects you, we will update the date at the top and, for
              significant changes, notify you in the application. Continuing to use SkillSpring after a change
              means you accept the updated policy.
            </p>
          ),
        },
        {
          id: 'disclaimer',
          heading: 'Important disclaimer',
          body: (
            <p>
              This document is written to describe accurately how the software behaves. It is not legal advice
              and makes no claim of certification or compliance with any specific regulatory framework. If you
              operate this software for others, or if your situation involves legal obligations we have not
              addressed here, take qualified legal advice for your jurisdiction.
            </p>
          ),
        },
      ]}
    />
  );
}
