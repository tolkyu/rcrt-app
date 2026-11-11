'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormError } from '@/components/ui/form-error';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Textarea } from '@/components/ui/textarea';
import {
  hasOnlyVisibleChars,
  normalizePositionName,
} from '@/lib/position-name';
import {
  VACANCY_REASON_MAX,
  VACANCY_TITLE_MAX,
  VACANCY_TITLE_MIN,
} from '@/lib/schemas/vacancy';
import { serverTextLength } from '@/lib/text-length';
import { GalleryGroup } from './gallery-section';

const PRIORITIES = ['normal', 'urgent'] as const;
const SHORT_LIMIT = 40;

/** Same pipeline as the vacancy `line()` and `cancelVacancySchema`: visible characters only, NFC + collapsed whitespace, then min/max in code points. */
const line = (
  min: number,
  max: number,
  message: { invalid: string; short: string; long: string },
) =>
  z
    .string()
    .refine(hasOnlyVisibleChars, message.invalid)
    .overwrite(normalizePositionName)
    .min(min, message.short)
    .max(max, message.long);

const formSchema = (message: {
  invalid: string;
  title: string;
  titleLong: string;
  reason: string;
  reasonLong: string;
  consent: string;
}) =>
  z.object({
    title: line(VACANCY_TITLE_MIN, VACANCY_TITLE_MAX, {
      invalid: message.invalid,
      short: message.title,
      long: message.titleLong,
    }),
    reason: line(1, VACANCY_REASON_MAX, {
      invalid: message.invalid,
      short: message.reason,
      long: message.reasonLong,
    }),
    priority: z.enum(PRIORITIES),
    consent: z.boolean().refine(Boolean, message.consent),
  });

type FormValues = z.output<ReturnType<typeof formSchema>>;

const fieldClass = 'min-w-0';

function States() {
  const t = useTranslations('devUi.form');
  const [reason, setReason] = useState(t('reasonSample'));
  const [limited, setLimited] = useState(t('reasonSample'));
  const [priority, setPriority] = useState<string>('normal');
  const options = PRIORITIES.map((value) => ({
    value,
    label: t(value === 'normal' ? 'priorityNormal' : 'priorityUrgent'),
  }));
  return (
    <GalleryGroup title={t('states')}>
      <div className="grid w-full items-start gap-x-6 gap-y-4 sm:grid-cols-2">
        <FormField
          id="form-demo-title"
          label={t('titleLabel')}
          required
          hint={t('titleHint')}
          className={fieldClass}
        >
          {(field) => <Input {...field} autoComplete="off" />}
        </FormField>
        <FormField
          id="form-demo-title-invalid"
          label={t('titleLabel')}
          required
          error={t('titleShort')}
          className={fieldClass}
        >
          {(field) => <Input {...field} autoComplete="off" />}
        </FormField>
        <FormField
          id="form-demo-reason"
          label={t('reasonLabel')}
          hint={t('reasonHint')}
          counter={{ count: serverTextLength(reason), max: VACANCY_REASON_MAX }}
          className={fieldClass}
        >
          {(field) => (
            <Textarea
              {...field}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </FormField>
        <FormField
          id="form-demo-reason-over"
          label={t('reasonShortLabel', { max: SHORT_LIMIT })}
          error={t('reasonLong', { max: SHORT_LIMIT })}
          counter={{ count: serverTextLength(limited), max: SHORT_LIMIT }}
          className={fieldClass}
        >
          {(field) => (
            <Textarea
              {...field}
              value={limited}
              onChange={(event) => setLimited(event.target.value)}
            />
          )}
        </FormField>
        <FormField
          id="form-demo-priority"
          layout="group"
          label={t('priorityLabel')}
          className={fieldClass}
        >
          {(field) => (
            <SegmentedControl
              {...field}
              options={options}
              value={priority}
              onValueChange={setPriority}
            />
          )}
        </FormField>
        <FormField
          id="form-demo-channel"
          layout="group"
          label={t('channelLabel')}
          className={fieldClass}
        >
          {(field) => (
            <RadioGroup {...field} defaultValue="email">
              <RadioGroupItem
                id="form-demo-channel-email"
                value="email"
                label={t('channelEmail')}
              />
              <RadioGroupItem
                id="form-demo-channel-phone"
                value="phone"
                label={t('channelPhone')}
              />
              <RadioGroupItem
                id="form-demo-channel-messenger"
                value="messenger"
                label={t('channelMessenger')}
              />
            </RadioGroup>
          )}
        </FormField>
        <FormField
          id="form-demo-consent"
          layout="inline"
          label={t('consentLabel')}
          required
          error={t('consentRequired')}
          className={fieldClass}
        >
          {(field) => <Checkbox {...field} />}
        </FormField>
        <div className={fieldClass}>
          <p className="mb-1.5 text-sm font-medium">{t('summary')}</p>
          <FormError count={2} attempt={1} />
        </div>
      </div>
    </GalleryGroup>
  );
}

function ValidatedForm() {
  const t = useTranslations('devUi.form');
  const schema = useMemo(
    () =>
      formSchema({
        invalid: t('invalidChars'),
        title: t('titleShort'),
        titleLong: t('titleLong', { max: VACANCY_TITLE_MAX }),
        reason: t('reasonRequired'),
        reasonLong: t('reasonLong', { max: VACANCY_REASON_MAX }),
        consent: t('consentRequired'),
      }),
    [t],
  );
  const {
    register,
    control,
    handleSubmit,
    subscribe,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      title: '',
      reason: '',
      priority: 'normal',
      consent: false,
    },
  });
  const reason = useWatch({ control, name: 'reason' });
  const [summary, setSummary] = useState({ count: 0, attempt: 0 });
  const [sent, setSent] = useState(false);
  const [announce, setAnnounce] = useState(true);
  useEffect(
    () =>
      subscribe({
        formState: { values: true },
        callback: ({ type }) => {
          if (type === 'change') setAnnounce(true);
        },
      }),
    [subscribe],
  );
  const options = PRIORITIES.map((value) => ({
    value,
    label: t(value === 'normal' ? 'priorityNormal' : 'priorityUrgent'),
  }));

  return (
    <GalleryGroup title={t('formGroup')} hint={t('formHint')}>
      <form
        noValidate
        className="flex w-full max-w-md flex-col gap-4"
        onSubmit={handleSubmit(
          () => {
            setSummary((current) => ({ ...current, count: 0 }));
            setSent(true);
          },
          (invalid) => {
            setSent(false);
            setAnnounce(false);
            setSummary((current) => ({
              count: Object.keys(invalid).length,
              attempt: current.attempt + 1,
            }));
          },
        )}
      >
        <FormField
          id="form-rhf-title"
          label={t('titleLabel')}
          required
          hint={t('titleHint')}
          error={errors.title?.message}
          announce={announce}
        >
          {(field) => (
            <Input {...field} autoComplete="off" {...register('title')} />
          )}
        </FormField>
        <FormField
          id="form-rhf-reason"
          label={t('reasonLabel')}
          required
          error={errors.reason?.message}
          announce={announce}
          counter={{
            count: serverTextLength(reason),
            max: VACANCY_REASON_MAX,
          }}
        >
          {(field) => <Textarea {...field} {...register('reason')} />}
        </FormField>
        <Controller
          control={control}
          name="priority"
          render={({ field }) => (
            <FormField
              id="form-rhf-priority"
              layout="group"
              label={t('priorityLabel')}
            >
              {(props) => (
                <SegmentedControl
                  {...props}
                  ref={field.ref}
                  options={options}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            </FormField>
          )}
        />
        <Controller
          control={control}
          name="consent"
          render={({ field, fieldState }) => (
            <FormField
              id="form-rhf-consent"
              layout="inline"
              label={t('consentLabel')}
              required
              error={fieldState.error?.message}
              announce={announce}
            >
              {(props) => (
                <Checkbox
                  {...props}
                  ref={field.ref}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            </FormField>
          )}
        />
        <FormError count={summary.count} attempt={summary.attempt} />
        <p role="status" className="text-success-text text-sm font-medium">
          {sent ? t('sent') : null}
        </p>
        <Button type="submit" className="self-start">
          {t('submit')}
        </Button>
      </form>
    </GalleryGroup>
  );
}

export function FormDemos() {
  return (
    <>
      <States />
      <ValidatedForm />
    </>
  );
}
