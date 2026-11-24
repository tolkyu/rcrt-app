import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { SettingsNav } from '@/components/settings/settings-nav';
import { visibleSettingsSections } from '@/lib/nav';
import { requirePrivilegedSession } from '../_lib/session';

/** «Налаштування» frame: sub-menu of the sections the Admin's permissions open (wireframe settings-admin §0). */
export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [ctx, t] = await Promise.all([
    requirePrivilegedSession(),
    getTranslations('settings.nav'),
  ]);
  const sections = visibleSettingsSections(new Set(ctx.auth.grants.keys()));
  if (sections.length === 0) notFound();
  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <SettingsNav
        label={t('label')}
        items={sections.map((section) => ({
          href: section.href,
          label: t(section.id),
        }))}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
