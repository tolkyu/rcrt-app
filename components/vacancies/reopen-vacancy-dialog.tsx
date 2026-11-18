'use client';

import { Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { VACANCY_HEADCOUNT_MAX } from '@/lib/vacancy-limits';
import { TeamAlert, TeamDialogShell, TeamSubmit } from './team-dialog-shell';
import { useStatusWrite, type StatusSubject } from './use-change-status';
import { closeWhenDone, type TeamDialogProps } from './use-team-write';

/** The same 1..100 rule as the form; empty or text is not a number, so it never reaches the server. */
const parseHeadcount = (text: string) =>
  /^\d{1,3}$/.test(text) &&
  Number(text) >= 1 &&
  Number(text) <= VACANCY_HEADCOUNT_MAX
    ? Number(text)
    : null;

/** Lazy chunk (default export). Opens on the number field, selected, so Enter confirms (wireframe §3.6); an unchanged number sends no headcount. */
export default function ReopenVacancyDialog({
  vacancy,
  onClose,
  onCloseAutoFocus,
}: TeamDialogProps & { vacancy: StatusSubject }) {
  const t = useTranslations('vacancies.statusMenu.reopenDialog');
  const fieldId = useId();
  const { pending, error, reopen, mountedRef } = useStatusWrite(vacancy);
  const [text, setText] = useState(String(vacancy.headcount));
  const [checked, setChecked] = useState(false);
  const count = parseHeadcount(text);
  const step = (by: number) => {
    setChecked(false);
    setText(
      String(
        Math.min(
          VACANCY_HEADCOUNT_MAX,
          Math.max(1, (count ?? vacancy.headcount) + by),
        ),
      ),
    );
  };
  const submit = () => {
    if (count === null) return setChecked(true);
    closeWhenDone(reopen(count), mountedRef, onClose);
  };
  return (
    <TeamDialogShell
      title={t('title')}
      vacancy={vacancy}
      pending={pending}
      onClose={onClose}
      onCloseAutoFocus={onCloseAutoFocus}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onClose(null)}
            disabled={pending}
          >
            {t('keep')}
          </Button>
          <TeamSubmit blocked={false} pending={pending} onClick={submit}>
            {t('confirm')}
          </TeamSubmit>
        </>
      }
    >
      <p className="text-muted-foreground text-sm">{t('body')}</p>
      {error && <TeamAlert>{error}</TeamAlert>}
      <FormField
        id={fieldId}
        label={t('headcount')}
        hint={t('hint', { count: vacancy.headcount })}
        error={checked && count === null ? t('invalid') : undefined}
      >
        {(control) => (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-11 shrink-0 md:size-10"
              aria-label={t('decrease')}
              disabled={pending}
              onClick={() => step(-1)}
            >
              <Minus aria-hidden="true" />
            </Button>
            <Input
              {...control}
              autoFocus
              value={text}
              inputMode="numeric"
              autoComplete="off"
              readOnly={pending}
              className="text-center tabular-nums"
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                setChecked(false);
                setText(event.target.value.trim());
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit();
              }}
            />
            <Button
              variant="outline"
              size="icon"
              className="size-11 shrink-0 md:size-10"
              aria-label={t('increase')}
              disabled={pending}
              onClick={() => step(1)}
            >
              <Plus aria-hidden="true" />
            </Button>
          </div>
        )}
      </FormField>
    </TeamDialogShell>
  );
}
