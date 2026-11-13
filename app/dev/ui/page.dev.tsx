import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { BadgesSection } from '@/components/dev-ui/badges-section';
import { ButtonsSection } from '@/components/dev-ui/buttons-section';
import { ComboboxSection } from '@/components/dev-ui/combobox-section';
import { DialogSection } from '@/components/dev-ui/dialog-section';
import { FormSection } from '@/components/dev-ui/form-section';
import { FilterChipsSection } from '@/components/dev-ui/filter-chips-section';
import { MotionSection } from '@/components/dev-ui/motion-section';
import { SelectSection } from '@/components/dev-ui/select-section';
import { ToastSection } from '@/components/dev-ui/toast-section';
import { TooltipSection } from '@/components/dev-ui/tooltip-section';
import { TokensSection } from '@/components/dev-ui/tokens-section';
import { devLoginAvailable } from '@/server/dev/dev-login';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('devUi');
  return { title: t('metaTitle') };
}

/** Component gallery for design review: compiled only by `next dev` (`.dev.tsx`) and 404 behind the dev-login guard otherwise. */
export default async function DevUiPage() {
  if (!devLoginAvailable()) notFound();
  const t = await getTranslations('devUi');
  return (
    <main className="bg-background text-foreground mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-10 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-display-xl">{t('title')}</h1>
        <p className="text-muted-foreground max-w-prose text-sm">
          {t('intro')}
        </p>
      </header>
      <TokensSection />
      <BadgesSection />
      <ButtonsSection />
      <SelectSection />
      <FilterChipsSection />
      <ComboboxSection />
      <FormSection />
      <TooltipSection />
      <ToastSection />
      <DialogSection />
      <MotionSection />
    </main>
  );
}
