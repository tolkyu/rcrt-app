import { getTranslations } from 'next-intl/server';
import { GallerySection } from './gallery-section';
import { MotionDemos } from './motion-demos';

export async function MotionSection() {
  const t = await getTranslations('devUi.motion');
  return (
    <GallerySection id="motion" title={t('title')} hint={t('hint')}>
      <MotionDemos
        labels={{
          slow: t('slow'),
          show: t('show'),
          hide: t('hide'),
          sample: t('sample'),
          demos: {
            pop: t('demos.pop'),
            tooltip: t('demos.tooltip'),
            modal: t('demos.modal'),
            sheetUp: t('demos.sheetUp'),
            sheetSide: t('demos.sheetSide'),
            fade: t('demos.fade'),
            instant: t('demos.instant'),
          },
        }}
      />
    </GallerySection>
  );
}
