import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { GallerySection } from './gallery-section';
import { SelectDemos } from './select-demos';

export async function SelectSection() {
  const [t, tCommon] = await Promise.all([
    getTranslations('devUi.select'),
    getTranslations('common'),
  ]);
  return (
    <GallerySection id="select" title={t('title')} hint={t('hint')}>
      <NextIntlClientProvider
        locale="uk"
        messages={{ common: { selectEmpty: tCommon('selectEmpty') } }}
      >
        <SelectDemos
          labels={{
            states: t('states'),
            placeholderLabel: t('placeholderLabel'),
            placeholder: t('placeholder'),
            selectedLabel: t('selectedLabel'),
            allLabel: t('allLabel'),
            all: t('all'),
            gambling: t('gambling'),
            crypto: t('crypto'),
            gamblingHint: t('gamblingHint'),
            cryptoHint: t('cryptoHint'),
            invalidLabel: t('invalidLabel'),
            disabledLabel: t('disabledLabel'),
            emptyLabel: t('emptyLabel'),
            longGroup: t('longGroup'),
            longHint: t('longHint'),
            longLabel: t('longLabel'),
            longOption: t('longOption'),
            shortOption: t('shortOption'),
            narrowLabel: t('narrowLabel'),
            openGroup: t('openGroup'),
            openHint: t('openHint'),
            openButton: t('openButton'),
            openLabel: t('openLabel'),
          }}
        />
      </NextIntlClientProvider>
    </GallerySection>
  );
}
