'use client';

import { UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { lazy, useEffect, useRef, useState, type ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import {
  ConfirmDialog,
  type ConfirmDialogProps,
} from '@/components/ui/confirm-dialog';
import { DeferredMenu, useDeferredMenu } from '@/components/ui/deferred-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import type { ModalSize } from '@/components/ui/modal-surface';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  type SheetSize,
} from '@/components/ui/sheet';
import { VACANCY_REASON_MAX } from '@/lib/schemas/vacancy';
import { toast } from '@/lib/toast';
import { GalleryGroup } from './gallery-section';

const loadMenu = () => import('./dialog-menu-demo');
const DemoMenu = lazy(loadMenu);

const SIZES: readonly ModalSize[] = ['sm', 'md', 'lg'];
const PENDING_MS = 1_200;
const CONFLICT_MS = 400;

function useLater() {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (run: () => void, ms: number) => {
    timer.current = setTimeout(run, ms);
  };
}

function SizeDemo({ size }: { size: ModalSize }) {
  const t = useTranslations('devUi.dialogs');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {t(`sizeLabel.${size}`)}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={tCommon('close')} size={size}>
          <DialogHeader
            icon={<UserPlus />}
            title={t('inviteTitle')}
            subtitle={t('inviteSubtitle')}
          />
          <FormField id={`dialog-${size}-name`} label={t('nameLabel')} required>
            {(control) => <Input {...control} autoComplete="off" />}
          </FormField>
          <FormField id={`dialog-${size}-email`} label={t('emailLabel')}>
            {(control) => <Input {...control} type="email" />}
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tCommon('cancel')}
            </Button>
            <Button onClick={() => setOpen(false)}>{t('send')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type CaseProps = Pick<
  ConfirmDialogProps,
  | 'title'
  | 'description'
  | 'consequence'
  | 'tone'
  | 'confirmLabel'
  | 'cancelLabel'
  | 'reason'
>;

/** `delay` simulates a slow request (pending); `fails` answers it with an inline conflict instead of closing. */
function ConfirmCase({
  label,
  delay = 0,
  fails = false,
  onConfirmed,
  ...dialog
}: CaseProps & {
  label: string;
  delay?: number;
  fails?: boolean;
  onConfirmed: () => void;
}) {
  const t = useTranslations('devUi.dialogs');
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const later = useLater();
  const settle = () => {
    setPending(false);
    if (fails) return setFailed(true);
    onConfirmed();
    setOpen(false);
  };
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setFailed(false);
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <ConfirmDialog
        {...dialog}
        open={open}
        onOpenChange={setOpen}
        pending={pending}
        error={failed ? t('conflictMessage') : undefined}
        onConfirm={() => {
          setFailed(false);
          if (delay === 0) return settle();
          setPending(true);
          later(settle, delay);
        }}
      />
    </>
  );
}

function ConfirmDemos() {
  const t = useTranslations('devUi.dialogs');
  const [count, setCount] = useState(0);
  const confirmed = () => setCount((value) => value + 1);
  const reason: CaseProps['reason'] = {
    label: t('reasonLabel'),
    hint: t('reasonHint'),
    maxLength: VACANCY_REASON_MAX,
  };
  return (
    <GalleryGroup title={t('confirms')} hint={t('confirmsHint')}>
      <ConfirmCase
        label={t('neutral')}
        title={t('neutralTitle')}
        description={t('neutralDescription')}
        confirmLabel={t('neutralConfirm')}
        onConfirmed={confirmed}
      />
      <ConfirmCase
        label={t('destructive')}
        tone="destructive"
        title={t('destructiveTitle')}
        description={t('destructiveDescription')}
        consequence={[t('consequenceList'), t('consequenceHistory')]}
        confirmLabel={t('destructiveConfirm')}
        onConfirmed={confirmed}
      />
      <ConfirmCase
        label={t('withReason')}
        tone="destructive"
        title={t('reasonTitle')}
        confirmLabel={t('reasonConfirm')}
        cancelLabel={t('reasonCancel')}
        reason={reason}
        delay={PENDING_MS}
        onConfirmed={confirmed}
      />
      <ConfirmCase
        label={t('conflict')}
        tone="destructive"
        title={t('reasonTitle')}
        confirmLabel={t('reasonConfirm')}
        reason={reason}
        delay={CONFLICT_MS}
        fails
        onConfirmed={confirmed}
      />
      <ConfirmCase
        label={t('worst')}
        tone="destructive"
        title={t('worstTitle')}
        consequence={[t('worstConsequence', { title: t('worstVacancy') })]}
        confirmLabel={t('reasonConfirm')}
        reason={reason}
        onConfirmed={confirmed}
      />
      <ConfirmCase
        label={t('longLabels')}
        tone="destructive"
        title={t('reasonTitle')}
        confirmLabel={t('longConfirm')}
        cancelLabel={t('longCancel')}
        reason={reason}
        delay={PENDING_MS}
        onConfirmed={confirmed}
      />
      <span className="text-muted-foreground text-sm">
        {t('confirmed', { count })}
      </span>
    </GalleryGroup>
  );
}

function LayersDemo() {
  const t = useTranslations('devUi.dialogs');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [vertical, setVertical] = useState('');
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {t('layersOpen')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={tCommon('close')} size="md">
          <DialogHeader
            title={t('layersTitle')}
            subtitle={t('layersSubtitle')}
          />
          <FormField id="dialog-layers-select" label={t('verticalLabel')}>
            {(control) => (
              <Select
                {...control}
                value={vertical}
                onValueChange={setVertical}
                placeholder={t('placeholder')}
                options={[
                  { value: 'gambling', label: t('optionGambling') },
                  { value: 'crypto', label: t('optionCrypto') },
                ]}
              />
            )}
          </FormField>
          <div className="flex flex-wrap gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">{t('menuLabel')}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem>{t('menuEdit')}</DropdownMenuItem>
                <DropdownMenuItem>{t('menuDelete')}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="secondary"
              onClick={() => toast.success(t('raised'))}
            >
              {t('raise')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The inner dialog is a React child of the sheet but a DOM sibling: the sheet's Escape hand-over is under test. */
function SheetDemo({ size }: { size: SheetSize }) {
  const t = useTranslations('devUi.dialogs');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [nested, setNested] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {t(`sheetLabel.${size}`)}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" size={size} closeLabel={tCommon('close')}>
          <div className="flex flex-col gap-2 p-6 pr-14">
            <SheetTitle>{t('sheetTitle')}</SheetTitle>
            <SheetDescription>{t('sheetDescription')}</SheetDescription>
            <Button
              variant="secondary"
              className="mt-2 self-start"
              onClick={() => setNested(true)}
            >
              {t('sheetNested')}
            </Button>
          </div>
        </SheetContent>
        <Dialog open={nested} onOpenChange={setNested}>
          <DialogContent closeLabel={tCommon('close')}>
            <DialogHeader
              title={t('sheetNestedTitle')}
              subtitle={t('sheetNestedDescription')}
            />
            <DialogFooter>
              <Button onClick={() => setNested(false)}>
                {t('nestedClose')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Sheet>
    </>
  );
}

function MenuDemo() {
  const t = useTranslations('devUi.dialogs');
  const menu = useDeferredMenu(loadMenu);
  const trigger = (props: ComponentProps<typeof Button>) => (
    <Button variant="outline" {...props}>
      {t('menuTrigger')}
    </Button>
  );
  return (
    <DeferredMenu menu={menu} trigger={trigger}>
      {(openedBy, menuTrigger) => (
        <DemoMenu trigger={menuTrigger} openedBy={openedBy} />
      )}
    </DeferredMenu>
  );
}

export function DialogDemos() {
  const t = useTranslations('devUi.dialogs');
  return (
    <>
      <GalleryGroup title={t('sizes')} hint={t('sizesHint')}>
        {SIZES.map((size) => (
          <SizeDemo key={size} size={size} />
        ))}
      </GalleryGroup>
      <ConfirmDemos />
      <GalleryGroup title={t('layers')} hint={t('layersHint')}>
        <LayersDemo />
      </GalleryGroup>
      <GalleryGroup title={t('sheets')} hint={t('sheetsHint')}>
        {SIZES.map((size) => (
          <SheetDemo key={size} size={size} />
        ))}
      </GalleryGroup>
      <GalleryGroup title={t('menus')} hint={t('menusHint')}>
        <MenuDemo />
      </GalleryGroup>
    </>
  );
}
