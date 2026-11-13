import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { FilterChipsDemos } from './filter-chips-demos';
import { GallerySection } from './gallery-section';

export async function FilterChipsSection() {
  const [t, { devUi }] = await Promise.all([
    getTranslations('devUi.filterChips'),
    getMessages(),
  ]);
  return (
    <GallerySection id="filter-chips" title={t('title')} hint={t('hint')}>
      <NextIntlClientProvider
        locale="uk"
        messages={{ devUi: { filterChips: devUi.filterChips } }}
      >
        <FilterChipsDemos />
      </NextIntlClientProvider>
    </GallerySection>
  );
}
