import { Link } from 'react-router-dom';
import { LegalShell } from './legal/LegalShell';

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of use"
      summary="These are the rules for using SkillSpring. They are written to be read, not to be impressive. If you do not agree with them, please do not use the platform."
      lastUpdated="24 October 2026"
      otherLink={{ to: '/privacy', label: 'Read the privacy policy' }}
      sections={[
        {
          id: 'agreement',
          heading: 'The agreement',
          body: (
            <>
              <p>
                By creating an account or using SkillSpring you agree to these terms. If you are using the
                platform on behalf of an organisation, you confirm you have authority to accept them.
              </p>
              <p>
                SkillSpring is an independent project and is not affiliated with, endorsed by, or connected to
                any other professional network or learning platform.
              </p>
            </>
          ),
        },
        {
          id: 'eligibility',
          heading: 'Who can use SkillSpring',
          body: (
            <ul className="ml-5 list-disc space-y-2">
              <li>You must be at least 18 years old.</li>
              <li>You must provide a working email address and verify it to unlock requests, messaging and community posting.</li>
              <li>You may hold one account. Creating accounts to evade a suspension or a block is not allowed.</li>
              <li>You must not be barred from using the service under the law that applies to you.</li>
            </ul>
          ),
        },
        {
          id: 'how-it-works',
          heading: 'What SkillSpring is',
          body: (
            <>
              <p>
                SkillSpring introduces members who want to exchange skills and gives them a shared workspace to
                plan and record sessions. It is a coordination tool.
              </p>
              <p>
                SkillSpring is not a party to any exchange between members. We do not teach, supervise or
                verify the teaching, and we do not process payments. You agree the terms of each exchange
                directly with your partner, and the quality of what you receive is between the two of you.
              </p>
            </>
          ),
        },
        {
          id: 'account',
          heading: 'Your account',
          body: (
            <>
              <ul className="ml-5 list-disc space-y-2">
                <li>Keep your password confidential. You are responsible for activity under your account.</li>
                <li>Tell us promptly if you believe your account has been compromised.</li>
                <li>Keep your profile accurate. Claiming a level of expertise you do not have misleads the people who rely on it when choosing a partner.</li>
                <li>You can delete your account at any time from settings.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'conduct',
          heading: 'How to behave',
          body: (
            <>
              <p>You agree not to:</p>
              <ul className="ml-5 list-disc space-y-2">
                <li>Harass, threaten, or abuse anyone, including through messages, reviews or community posts.</li>
                <li>Post spam, advertising, referral links or repetitive content.</li>
                <li>Impersonate another person or misrepresent your identity, credentials or affiliations.</li>
                <li>Use the platform to sell courses, services or products, or to solicit payment for teaching.</li>
                <li>Upload unlawful content, malware, or content you do not have the right to share.</li>
                <li>Scrape, harvest or bulk-collect member information.</li>
                <li>Probe, scan or attempt to breach the platform's security or another member's account.</li>
                <li>Circumvent rate limits, blocks, suspensions or other technical controls.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'exchanges',
          heading: 'Exchanges and sessions',
          body: (
            <>
              <ul className="ml-5 list-disc space-y-2">
                <li>An exchange becomes active only when both members agree the terms. Either member can pause, cancel or decline before or during it.</li>
                <li>You are responsible for attending sessions you agreed to. Persistent non-attendance may be reported and can affect your reputation on the platform.</li>
                <li>Completion requires both members to confirm it. This is deliberate: neither member can unilaterally close an exchange as finished.</li>
                <li>Session times are shown in each participant's own timezone. Check the details before you commit.</li>
                <li>SkillSpring does not record or host session audio or video. Any meeting link is provided by a third party and is subject to that provider's terms.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'reviews',
          heading: 'Reviews and reputation',
          body: (
            <>
              <ul className="ml-5 list-disc space-y-2">
                <li>You may leave one review per partner, and only for an exchange you both took part in.</li>
                <li>Reviews must reflect your genuine experience. Reviews left in exchange for a favour, or to retaliate, are not allowed.</li>
                <li>Reviews cannot be edited or deleted once submitted. This keeps the record honest for everyone.</li>
                <li>If you delete your account, reviews you wrote remain, attributed to a deleted member.</li>
                <li>You can report a review you believe breaks these terms. A moderator will decide.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'content',
          heading: 'Your content and our licence',
          body: (
            <>
              <p>
                You keep ownership of everything you create — your profile text, notes, messages, community
                posts and reviews.
              </p>
              <p>
                To operate the platform, you grant us a limited licence to store, display and transmit that
                content to the people who are entitled to see it. This licence exists only so the service can
                function: it does not transfer ownership, and it ends when the content is deleted, except where
                content has been shared with another member who keeps their own copy of the record.
              </p>
              <p>
                You are responsible for making sure you have the right to share anything you upload.
              </p>
            </>
          ),
        },
        {
          id: 'moderation',
          heading: 'Moderation and enforcement',
          body: (
            <>
              <p>
                Moderators and administrators can review reported content, hide it, and warn, suspend or
                terminate accounts that break these terms. Where an account is suspended or terminated, we may
                also remove content that caused the problem.
              </p>
              <p>
                Administrative actions on accounts, content and the skill taxonomy are written to an audit log
                so they can be reviewed. If you think a moderation decision was wrong, contact us through the
                help centre.
              </p>
            </>
          ),
        },
        {
          id: 'availability',
          heading: 'Availability and changes',
          body: (
            <p>
              We aim to keep SkillSpring running, but we do not guarantee uninterrupted availability. Features
              may change, and optional integrations depend on services an operator configures. We may suspend
              the service for maintenance. Where a change materially affects you, we will tell you in the
              application.
            </p>
          ),
        },
        {
          id: 'liability',
          heading: 'Limits of our responsibility',
          body: (
            <>
              <p>
                SkillSpring is provided as it is. To the fullest extent the law allows, we exclude implied
                warranties and are not liable for indirect or consequential loss arising from your use of the
                platform.
              </p>
              <p>
                In particular, we are not responsible for the conduct of other members, for the accuracy of
                what they teach or claim, or for anything that happens in a session or a meeting arranged
                through the platform. You arrange and attend sessions at your own risk, and you should take the
                usual precautions before meeting someone in person.
              </p>
              <p>
                Nothing in these terms excludes liability that cannot lawfully be excluded.
              </p>
            </>
          ),
        },
        {
          id: 'termination',
          heading: 'Ending your use',
          body: (
            <p>
              You may stop using SkillSpring and delete your account at any time. We may suspend or terminate
              your access if you break these terms, if we are required to by law, or if your use puts other
              members or the platform at risk. Where an account is deleted, completed exchanges are
              anonymised rather than destroyed, so your former partners keep their learning history.
            </p>
          ),
        },
        {
          id: 'general',
          heading: 'General',
          body: (
            <>
              <p>
                If any part of these terms is found to be unenforceable, the rest stays in force. Our failure to
                enforce a term is not a waiver of it. These terms, together with the{' '}
                <Link to="/privacy" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
                  privacy policy
                </Link>
                , are the whole agreement between us about the platform.
              </p>
              <p>
                These terms are written to describe how the software behaves and to set fair expectations
                between members. They are not legal advice, and they make no claim of certification under any
                specific regulatory framework. If you operate this software for others, take qualified legal
                advice for your jurisdiction.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
