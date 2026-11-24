import { useTranslations } from 'next-intl';
import type { VacancyDetail } from '@/lib/schemas/vacancy';

/** Header note of a paused vacancy: who can resume hears how, the rest only the fact; a vacancy nobody works on adds why recruiters do not see it. */
export function useStatusNote(
  vacancy: Pick<VacancyDetail, 'status' | 'statusActions' | 'recruiters'>,
): string | undefined {
  const t = useTranslations('vacancies.statusMenu.banner');
  if (vacancy.status !== 'ON_HOLD') return undefined;
  return [
    t(vacancy.statusActions.includes('RESUME') ? 'onHold' : 'onHoldReadOnly'),
    vacancy.recruiters.length === 0 ? t('onHoldFree') : undefined,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Static text for closed states (wireframe §5); a closed vacancy is read-only, so `updatedAt` is the day it closed. */
export function StatusBanner({
  vacancy,
}: {
  vacancy: Pick<VacancyDetail, 'status' | 'updatedAt'>;
}) {
  const t = useTranslations('vacancies.statusMenu.banner');
  if (vacancy.status !== 'FILLED' && vacancy.status !== 'CANCELLED')
    return null;
  const at = new Date(vacancy.updatedAt);
  return (
    <p className="bg-surface-muted text-foreground rounded-lg p-3 text-sm">
      {t(vacancy.status === 'FILLED' ? 'filled' : 'cancelled', { at })}
    </p>
  );
}
