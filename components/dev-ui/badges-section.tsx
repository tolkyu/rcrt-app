import { Bot, Flame } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { GalleryGroup, GallerySection } from './gallery-section';

export async function BadgesSection() {
  const t = await getTranslations('devUi.badges');
  const tags = t.raw('tags') as string[];
  const flags = (
    <>
      <Badge size="sm" icon={Flame} tone="danger">
        {t('urgent')}
      </Badge>
      <Badge size="sm" icon={Bot} tone="info" outline>
        {t('fromBot')}
      </Badge>
    </>
  );
  return (
    <GallerySection id="badges" title={t('title')} hint={t('hint')}>
      <GalleryGroup title={t('statuses')}>
        <Badge dot tone="success">
          {t('open')}
        </Badge>
        <Badge dot tone="warning">
          {t('onHold')}
        </Badge>
        <Badge dot tone="brand">
          {t('filled')}
        </Badge>
        <Badge dot tone="neutral">
          {t('cancelled')}
        </Badge>
        <Badge dot tone="neutral" dashed outline>
          {t('draft')}
        </Badge>
      </GalleryGroup>
      <GalleryGroup title={t('flags')}>
        {flags}
        <Badge size="sm" icon={Flame} tone="neutral" title={t('closedUrgent')}>
          {t('urgent')}
        </Badge>
      </GalleryGroup>
      <GalleryGroup title={t('worstCase')} hint={t('worstCaseHint')}>
        <Badge tone="info" truncate>
          {t('longTag')}
        </Badge>
        <Badge tone="neutral" className="tabular-nums">
          {t('count')}
        </Badge>
        <Badge tone="neutral">{t('overflow')}</Badge>
        <div className="flex w-full flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} size="sm" tone="brand" truncate>
              {tag}
            </Badge>
          ))}
          <Badge size="sm" tone="neutral">
            {t('overflow')}
          </Badge>
        </div>
        <div
          aria-label={t('oneTitle')}
          className="flex w-full max-w-xs flex-wrap gap-1.5"
        >
          <Badge dot tone="warning">
            {t('onHold')}
          </Badge>
          {flags}
        </div>
      </GalleryGroup>
    </GallerySection>
  );
}
