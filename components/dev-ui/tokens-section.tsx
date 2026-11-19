import { getTranslations } from 'next-intl/server';
import { GalleryGroup, GallerySection } from './gallery-section';

const surfaces = [
  { name: '--background', className: 'bg-background' },
  { name: '--surface', className: 'bg-surface' },
  { name: '--surface-muted', className: 'bg-surface-muted' },
  { name: '--border', className: 'bg-border' },
] as const;

const tones = [
  {
    id: 'success',
    pill: 'bg-success-subtle text-success-text',
    dot: 'bg-success',
  },
  {
    id: 'warning',
    pill: 'bg-warning-subtle text-warning-text',
    dot: 'bg-warning',
  },
  { id: 'info', pill: 'bg-info-subtle text-info-text', dot: 'bg-info' },
  {
    id: 'danger',
    pill: 'bg-destructive-subtle text-error-text',
    dot: 'bg-error',
  },
] as const;

export async function TokensSection() {
  const t = await getTranslations('devUi.tokens');
  return (
    <GallerySection id="tokens" title={t('title')}>
      <GalleryGroup title={t('surfaces')} hint={t('surfacesHint')}>
        {surfaces.map((surface) => (
          <div key={surface.name} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`${surface.className} border-input size-10 rounded-lg border`}
            />
            <code className="text-xs">{surface.name}</code>
          </div>
        ))}
      </GalleryGroup>
      <GalleryGroup title={t('textOnSubtle')} hint={t('textOnSubtleHint')}>
        {tones.map((tone) => (
          <span
            key={tone.id}
            className={`${tone.pill} outline-ring inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-2 outline-offset-2`}
          >
            <span
              aria-hidden="true"
              className={`${tone.dot} size-2 rounded-full`}
            />
            {t(tone.id)}
          </span>
        ))}
      </GalleryGroup>
      <GalleryGroup title={t('accents')} hint={t('accentsHint')}>
        <span className="flex items-center gap-2 text-sm">
          <span aria-hidden="true" className="bg-brand size-6 rounded-md" />
          {t('brandAccent')}
        </span>
        <span className="flex items-center gap-2 text-sm">
          <span
            aria-hidden="true"
            className="bg-brand-fill size-6 rounded-md"
          />
          {t('brandFill')}
        </span>
        <span className="bg-primary-subtle text-link flex items-center rounded-lg py-2 pr-3 pl-3 text-sm font-medium shadow-[inset_2px_0_0_0_var(--brand)]">
          {t('selectedRow')}
        </span>
        <span className="outline-ring bg-surface rounded-lg px-3 py-2 text-sm outline-2 outline-offset-2">
          {t('focusRing')}
        </span>
      </GalleryGroup>
    </GallerySection>
  );
}
