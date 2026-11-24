import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { DialogDemos } from './dialog-demos';
import { GallerySection } from './gallery-section';

export async function DialogSection() {
  const [t, { common, form, devUi }] = await Promise.all([
    getTranslations('devUi.dialogs'),
    getMessages(),
  ]);
  return (
    <GallerySection id="dialogs" title={t('title')} hint={t('hint')}>
      <NextIntlClientProvider
        locale="uk"
        messages={{ common, form, devUi: { dialogs: devUi.dialogs } }}
      >
        <DialogDemos />
      </NextIntlClientProvider>
    </GallerySection>
  );
}
