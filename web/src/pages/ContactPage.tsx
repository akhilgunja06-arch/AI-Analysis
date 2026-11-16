import { Link } from 'react-router-dom';
import { BookOpen, Clock, Mail, MessageSquare, Shield } from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ContactForm } from '@/components/ContactForm';
import { useIntegrationStatus } from '@/hooks/queries';

export default function ContactPage() {
  const { data: integrations } = useIntegrationStatus();
  const provider = integrations?.emailDelivery.provider ?? 'disabled';

  // `console` logs the message locally; only `smtp` actually delivers it.
  const emailNote =
    provider === 'smtp'
      ? 'Email delivery is configured, so you will receive an acknowledgement at the address above.'
      : provider === 'console'
        ? 'Email delivery is not configured for real sending on this deployment — messages are logged locally. Your message is still stored and its reference is shown here.'
        : 'Email delivery is switched off on this deployment. Your message is still stored and its reference is shown here.';

  return (
    <PageContainer size="narrow">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/12 dark:text-brand-300">
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
          Contact us
        </span>
        <h1 className="ss-heading-page mt-5">Get in touch</h1>
        <p className="mt-4 ss-muted">
          Report a problem, ask about your account, flag something for moderation, or send feedback. We usually
          reply within two working days.
        </p>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Send us a message"
            description="Every message is stored and given a reference you can quote if you follow up."
            icon={<MessageSquare className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody>
            <ContactForm />
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Response time</p>
                  <p className="mt-0.5 ss-muted">
                    We aim to reply within two working days. Messages are handled in the order they arrive.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Email delivery</p>
                  <p className="mt-0.5 ss-muted">{emailNote}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Shield className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Reporting something urgent</p>
                  <p className="mt-0.5 ss-muted">
                    To report a member or a message, use the report option on their profile or the message itself —
                    those reports reach moderation with the right context attached.
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <BookOpen className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                Looking for an answer now?
              </p>
              <p className="mt-1.5 text-sm ss-muted">
                Many questions are already answered in the help centre, including how exchanges, matching and
                account settings work.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/help">
                  <Button size="sm" variant="secondary">
                    Help centre
                  </Button>
                </Link>
                <Link to="/about">
                  <Button size="sm" variant="ghost">
                    About SkillSpring
                  </Button>
                </Link>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <p className="mt-6 text-center text-xs ss-subtle">
        Your message is stored so we can reply. See the{' '}
        <Link to="/privacy" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
          privacy policy
        </Link>{' '}
        for how we handle it.
      </p>
    </PageContainer>
  );
}
