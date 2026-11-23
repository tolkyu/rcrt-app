'use client';

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
} from 'react';
import { useTranslations } from 'next-intl';
import type { FieldControlProps } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { LoadBoundary } from '@/components/ui/load-boundary';
import type { RichTextDoc } from '@/lib/schemas/rich-text';
import type { EditorDocumentResult } from '@/lib/rich-text-editor-document';

export type RichTextEditorHandle = { focus: () => void };

export type RichTextEditorProps = FieldControlProps & {
  initialDocument: RichTextDoc | null;
  resetKey: string;
  disabled: boolean;
  onChange: (result: EditorDocumentResult) => void;
  onReadyChange: (ready: boolean) => void;
  ref?: Ref<RichTextEditorHandle>;
};

const subscribe = () => () => {};
const createRuntime = () => lazy(() => import('./rich-text-editor-runtime'));

export function RichTextEditor(props: RichTextEditorProps) {
  const t = useTranslations('richText');
  const browser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [attempt, setAttempt] = useState(() => ({
    Runtime: createRuntime(),
    key: 0,
  }));
  const ready = useRef(props.onReadyChange);
  useEffect(() => {
    ready.current = props.onReadyChange;
  });
  useEffect(() => {
    ready.current(false);
    return () => ready.current(false);
  }, []);
  const skeleton = (
    <div
      role="status"
      className="bg-surface-muted min-h-[420px] rounded-lg p-4"
    >
      {t('loading')}
    </div>
  );
  const { Runtime } = attempt;
  return (
    <LoadBoundary
      key={attempt.key}
      onError={() => ready.current(false)}
      fallback={
        <div
          role="alert"
          className="border-border min-h-[420px] rounded-lg border p-4"
        >
          <p>{t('loadFailed')}</p>
          <Button
            variant="outline"
            onClick={() => {
              ready.current(false);
              setAttempt(({ key }) => ({
                Runtime: createRuntime(),
                key: key + 1,
              }));
            }}
          >
            {t('retry')}
          </Button>
        </div>
      }
    >
      <Suspense fallback={skeleton}>
        {browser ? <Runtime {...props} /> : skeleton}
      </Suspense>
    </LoadBoundary>
  );
}
