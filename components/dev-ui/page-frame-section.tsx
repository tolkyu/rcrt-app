import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { GallerySection } from './gallery-section';
import { EmptyStateDemos, PreviewHeaderDemos } from './page-frame-detail-demos';
import { PageFrameDemos } from './page-frame-demos';
import { SkeletonDemos } from './page-frame-skeleton-demos';

export async function PageFrameSection() {
  const [t, { common, devUi, form, states, vacancies, vacancyForm }] =
    await Promise.all([getTranslations('devUi.pageFrame'), getMessages()]);
  return (
    <GallerySection id="page-frame" title={t('title')} hint={t('hint')}>
      <NextIntlClientProvider
        locale="uk"
        messages={{
          common,
          form,
          states,
          vacancies,
          vacancyForm,
          devUi: { pageFrame: devUi.pageFrame },
        }}
      >
        <PageFrameDemos />
        <SkeletonDemos />
        <PreviewHeaderDemos />
        <EmptyStateDemos />
      </NextIntlClientProvider>
    </GallerySection>
  );
}
