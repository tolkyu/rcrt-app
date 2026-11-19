import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { ComboboxDemos } from './combobox-demos';
import { GallerySection } from './gallery-section';

export async function ComboboxSection() {
  const [t, { common, form, devUi }] = await Promise.all([
    getTranslations('devUi.combobox'),
    getMessages(),
  ]);
  return (
    <GallerySection id="combobox" title={t('title')} hint={t('hint')}>
      <NextIntlClientProvider
        locale="uk"
        messages={{ common, form, devUi: { combobox: devUi.combobox } }}
      >
        <ComboboxDemos />
      </NextIntlClientProvider>
    </GallerySection>
  );
}
