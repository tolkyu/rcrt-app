import type messages from '@/messages/uk.json';

declare module 'next-intl' {
  interface AppConfig {
    Locale: 'uk';
    Messages: typeof messages;
  }
}
