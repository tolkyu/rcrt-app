import { getTranslations } from 'next-intl/server';
import { GallerySection } from './gallery-section';
import { TooltipDemos } from './tooltip-demos';

export async function TooltipSection() {
  const t = await getTranslations('devUi.tooltip');
  return (
    <GallerySection id="tooltip" title={t('title')} hint={t('hint')}>
      <TooltipDemos
        labels={{
          basic: t('basic'),
          basicLabel: t('basicLabel'),
          basicText: t('basicText'),
          longLabel: t('longLabel'),
          longText: t('longText'),
          edge: t('edge'),
          edgeHint: t('edgeHint'),
          edgeStart: t('edgeStart'),
          edgeEnd: t('edgeEnd'),
          disabled: t('disabled'),
          disabledHint: t('disabledHint'),
          publish: t('publish'),
          publishReason: t('publishReason'),
          limitReason: t('limitReason'),
          save: t('save'),
          available: t('available'),
          attempts: t('attempts'),
        }}
      />
    </GallerySection>
  );
}
