import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { GallerySection } from './gallery-section';
import { PageFrameDemos } from './page-frame-demos';

export async function PageFrameSection() {
  const [t, { devUi }] = await Promise.all([
    getTranslations('devUi.pageFrame'),
    getMessages(),
  ]);
  return (
    <GallerySection id="page-frame" title={t('title')} hint={t('hint')}>
      <NextIntlClientProvider
        locale="uk"
        messages={{ devUi: { pageFrame: devUi.pageFrame } }}
      >
        <PageFrameDemos />
      </NextIntlClientProvider>
    </GallerySection>
  );
}
