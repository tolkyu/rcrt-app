import { createTranslator } from 'use-intl/core';
import messages from '@/messages/uk.json';
import type { EmailMessage } from './transport';

const t = createTranslator({
  locale: 'uk',
  messages,
  namespace: 'auth.email',
  timeZone: 'Europe/Kyiv',
});

const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

function layout(
  to: string,
  subject: string,
  paragraphs: string[],
  action?: { label: string; url: string },
): EmailMessage {
  const body = paragraphs.map((p) => `<p>${escape(p)}</p>`).join('');
  const button = action
    ? `<p><a href="${escape(action.url)}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#5558EF;color:#ffffff;text-decoration:none;font-weight:600">${escape(action.label)}</a></p><p style="font-size:12px;color:#64748B">${escape(t('linkFallback'))}<br>${escape(action.url)}</p>`
    : '';
  return {
    to,
    subject,
    html: `<!doctype html><html lang="uk"><body style="font-family:Inter,Arial,sans-serif;color:#0F172A;line-height:1.5"><p style="font-weight:700;font-size:18px">Hiring</p>${body}${button}<p style="font-size:12px;color:#64748B">${escape(t('footer'))}</p></body></html>`,
    text: [
      ...paragraphs,
      ...(action ? [`${action.label}: ${action.url}`] : []),
      t('footer'),
    ].join('\n\n'),
  };
}

export function magicLinkEmail(to: string, url: string): EmailMessage {
  return layout(
    to,
    t('magicLink.subject'),
    [t('magicLink.intro'), t('magicLink.expiry'), t('magicLink.ignore')],
    { label: t('magicLink.action'), url },
  );
}

export function inviteEmail(
  to: string,
  input: { fullName: string; url: string; expiresAt: Date },
): EmailMessage {
  return layout(
    to,
    t('invite.subject'),
    [
      t('invite.greeting', { name: input.fullName }),
      t('invite.intro'),
      t('invite.expiry', { expiresAt: input.expiresAt }),
    ],
    { label: t('invite.action'), url: input.url },
  );
}

export function mfaResetEmail(to: string, fullName: string): EmailMessage {
  return layout(to, t('mfaReset.subject'), [
    t('mfaReset.greeting', { name: fullName }),
    t('mfaReset.body'),
    t('mfaReset.warning'),
  ]);
}
