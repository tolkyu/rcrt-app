'use client';

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
} from 'react';
import type { FieldControlProps } from '@/components/ui/form-field';
import { LoadBoundary } from '@/components/ui/load-boundary';
import type { RichTextDoc } from '@/lib/schemas/rich-text';
import type { EditorDocumentResult } from '@/lib/rich-text-editor-document';
import { RichTextLoadFailed, RichTextSkeleton } from './rich-text-slot';

export type RichTextEditorHandle = { focus: () => void };

export type RichTextEditorProps = FieldControlProps & {
  initialDocument: RichTextDoc | null;
  resetKey: string;
  disabled: boolean;
  fieldLabel: string;
  onChange: (result: EditorDocumentResult) => void;
  onReadyChange: (ready: boolean) => void;
  onLoadFailedChange?: (failed: boolean) => void;
  ref?: Ref<RichTextEditorHandle>;
};

const subscribe = () => () => {};
const createRuntime = () => lazy(() => import('./rich-text-editor-runtime'));

/** Commits only with a resolved runtime, so it separates "chunk loaded" from `ready`, which is also false for an invalid document. */
function RuntimeLoaded({ onLoaded }: { onLoaded: () => void }) {
  useEffect(onLoaded, [onLoaded]);
  return null;
}

export function RichTextEditor({
  onLoadFailedChange,
  ...props
}: RichTextEditorProps) {
  const loadFailed = useRef(onLoadFailedChange);
  useEffect(() => {
    loadFailed.current = onLoadFailedChange;
  });
  const onLoaded = useCallback(() => loadFailed.current?.(false), []);
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
  const skeleton = <RichTextSkeleton />;
  const { Runtime } = attempt;
  return (
    <LoadBoundary
      key={attempt.key}
      onError={() => {
        ready.current(false);
        loadFailed.current?.(true);
      }}
      fallback={
        <RichTextLoadFailed
          onRetry={() => {
            ready.current(false);
            setAttempt(({ key }) => ({
              Runtime: createRuntime(),
              key: key + 1,
            }));
          }}
        />
      }
    >
      <Suspense fallback={skeleton}>
        {browser ? (
          <>
            <Runtime {...props} />
            <RuntimeLoaded onLoaded={onLoaded} />
          </>
        ) : (
          skeleton
        )}
      </Suspense>
    </LoadBoundary>
  );
}
