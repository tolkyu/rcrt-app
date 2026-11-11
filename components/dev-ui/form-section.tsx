import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { FormDemos } from './form-demos';
import { GallerySection } from './gallery-section';

export async function FormSection() {
  const [t, { form, devUi }] = await Promise.all([
    getTranslations('devUi.form'),
    getMessages(),
  ]);
  return (
    <GallerySection id="form" title={t('title')} hint={t('hint')}>
      <NextIntlClientProvider
        locale="uk"
        messages={{ form, devUi: { form: devUi.form } }}
      >
        <FormDemos />
      </NextIntlClientProvider>
    </GallerySection>
  );
}
