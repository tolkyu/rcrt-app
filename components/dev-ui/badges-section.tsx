import { Bot, Flame } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { GalleryGroup, GallerySection } from './gallery-section';

const pill =
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap';

export async function BadgesSection() {
  const t = await getTranslations('devUi.badges');
  const statuses = [
    { label: t('open'), className: 'bg-success-subtle text-success-text' },
    { label: t('onHold'), className: 'bg-warning-subtle text-warning-text' },
    { label: t('filled'), className: 'bg-primary-subtle text-link' },
    {
      label: t('cancelled'),
      className: 'bg-surface-muted text-muted-foreground-strong',
    },
  ];
  return (
    <GallerySection id="badges" title={t('title')} hint={t('hint')}>
      <GalleryGroup title={t('title')}>
        {statuses.map((status) => (
          <span key={status.label} className={`${pill} ${status.className}`}>
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-current"
            />
            {status.label}
          </span>
        ))}
        <span
          className={`${pill} border-input text-muted-foreground-strong border border-dashed`}
        >
          {t('draft')}
        </span>
        <span className={`${pill} bg-destructive-subtle text-error-text`}>
          <Flame className="size-3.5" aria-hidden="true" />
          {t('urgent')}
        </span>
        <span className={`${pill} bg-info-subtle text-info-text`}>
          <Bot className="size-3.5" aria-hidden="true" />
          {t('fromBot')}
        </span>
        <span className={`${pill} bg-info-subtle text-info-text max-w-48`}>
          <span className="truncate" title={t('longTag')}>
            {t('longTag')}
          </span>
        </span>
      </GalleryGroup>
    </GallerySection>
  );
}
