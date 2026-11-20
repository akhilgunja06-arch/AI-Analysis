/**
 * Disposable / throwaway email domains. Registration is refused for these so a
 * member cannot create an unverifiable identity. The list is deliberately
 * short and only contains domains whose sole purpose is temporary inboxes.
 */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', '10minutemail.com',
  'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'yopmail.com',
  'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com',
  'maildrop.cc', 'mintemail.com', 'mytemp.email', 'spamgourmet.com',
  'fakeinbox.com', 'mailnesia.com', 'tempinbox.com', 'emailondeck.com',
  'moakt.com', 'tempmailo.com', 'burnermail.io', 'mailcatch.com',
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase().trim();
  if (!domain) return true;
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  // Sub-domains of a known disposable provider are equally disposable.
  return [...DISPOSABLE_DOMAINS].some((d) => domain.endsWith(`.${d}`));
}
