import 'server-only';

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

/** Returns false on any delivery failure; callers show a neutral retry message (SEC-AUTH-1). */
export type SendEmail = (message: EmailMessage) => Promise<boolean>;

const TIMEOUT_MS = 10_000;
const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);

function sender(): { email: string; name: string } {
  const from = process.env.EMAIL_FROM;
  if (!from || !/^[^\s@<>]+@[^\s@<>]+$/.test(from))
    throw new Error('Invalid email configuration: EMAIL_FROM');
  return { email: from, name: 'Hiring' };
}

async function post(url: string, init: RequestInit): Promise<boolean> {
  try {
    const response = await fetch(url, {
      ...init,
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Local and test builds deliver into the Supabase CLI mail catcher; nothing leaves the machine. */
function mailpitTransport(baseUrl: string): SendEmail {
  return (message) => {
    const from = sender();
    return post(new URL('/api/v1/send', baseUrl).href, {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        From: { Email: from.email, Name: from.name },
        To: [{ Email: message.to }],
        Subject: message.subject,
        HTML: message.html,
        Text: message.text,
      }),
    });
  };
}

function resendTransport(apiKey: string): SendEmail {
  return (message) => {
    const from = sender();
    return post('https://api.resend.com/emails', {
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: `${from.name} <${from.email}>`,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
  };
}

export function createEmailTransport(
  env: Record<string, string | undefined> = process.env,
): SendEmail {
  const mailpit = env.MAILPIT_URL;
  if (mailpit && (env.APP_ENV === 'local' || env.APP_ENV === 'test')) {
    if (!loopback.has(new URL(mailpit).hostname))
      throw new Error('Invalid email configuration: MAILPIT_URL');
    return mailpitTransport(mailpit);
  }
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Invalid email configuration: RESEND_API_KEY');
  return resendTransport(apiKey);
}

let transport: SendEmail | undefined;
export const sendEmail: SendEmail = (message) => {
  transport ??= createEmailTransport();
  return transport(message);
};
