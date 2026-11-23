# F10-B editor code review — 2026-11-19

- Task: REVIEW-F10B; VAC-01, D117, PERF-04; ADR-020 F10-B and `docs/ux/ui-foundation.md` F10.
- Baseline: `phase-2` at `b0e7c3e`, hosted CI 44474819422 green. This review covers subsequent local editor work, not a new hosted result.
- Scope: `rich-text-editor.tsx`, `rich-text-editor-runtime.tsx`, `rich-text-toolbar.tsx`, `rich-text-link-dialog.tsx`, `richText.*` messages and the two editor unit-test files. Existing adapter/viewer/schema/primitives inspected as context only. No source edits.

## Blocking

None found.

## Should fix

None found in this bounded source review.

## Nit

None raised; no style churn under D126.

## Contract checks

- `components/rich-text/rich-text-editor.tsx:31`: shell has no runtime Tiptap import; React lazy plus the server snapshot/browser gate suppress runtime rendering/import during SSR. Retry creates both a new lazy initializer and a new error boundary. Loading/error/retry/unmount report false readiness.
- `components/rich-text/rich-text-editor-runtime.tsx:64`: creation validates before readiness; initialization does not emit a user change. Every document update emits the complete valid/invalid adapter result, retaining invalid input in the mounted editor. Disabled changes use `setEditable` without an update event.
- `components/rich-text/rich-text-editor-runtime.tsx:103`: only a changed resetKey adopts external content. Target content passes through the editor's own schema before canonical comparison; equivalent defaults/mark ranks do not cause setContent or cursor loss. Necessary replacements suppress user-update callbacks.
- `components/rich-text/rich-text-editor-runtime.tsx:28`: explicit extensions restrict headings to 1–3 and list items to paragraphs. Link rules reuse the canonical schema; automatic linking/paste linking/navigation-on-click are disabled, with explicit DOM click default prevention. No HTML injection or unsupported extension introduced.
- `components/rich-text/rich-text-toolbar.tsx:20`: editor-state subscription supplies pressed state; labelled native buttons retain keyboard activation, preserve selection on pointer press and suppress composing/disabled actions. Hard break correctly has no toggle state. High-frequency controls use no transition.
- `components/rich-text/rich-text-link-dialog.tsx:84`: portal Enter events stop propagation; modifier-Enter is prevented while ordinary Enter can activate a focused button. Input Enter applies validated links. Shared Dialog primitives supply title/description/focus trapping; selection is restored before mutation and on close. All visible copy comes from Ukrainian messages.
- Component owns no permission, mutation, query or Clear policy; those remain with the parent contract.

## Blast radius

Safety fact: canonical-equivalent adoption cannot overwrite the live selection, and invalid updates cannot silently expose the previous valid value as current. Proven against the actual installed Tiptap runtime, not an editor mock.

Reviewer execution:

```text
corepack pnpm exec vitest run --project unit tests/unit/rich-text-editor-runtime.test.ts -t 'emits invalid input|normalizes mark rank|validates a link'
1 file passed; 3 tests passed, 4 skipped.
```

The third real-runtime case also proves unsafe-link rejection, selection/focus restoration, default prevention for link clicks, Apply-button keyboard Enter, modifier-Enter portal containment, cancellation and link removal.

Consumer search currently finds no integrated page/card importer of this shell. Viewer and preview do not import the editor runtime. Future parent consumers must treat invalid results as current, gate saving on readiness and use resetKey only for deliberate baseline adoption; this review does not validate those unwritten integrations.

## Validation evidence and limits

- Engineer-reported final checks: 7 real-runtime + 3 shell tests passed; targeted ESLint/format and global typecheck passed. Shell tests exercise SSR non-import, readiness lifecycle and recovery after rejected lazy loading.
- Engineer-reported failing-before evidence: link-click test failed the `defaultPrevented` assertion before the explicit DOM handler; focused Apply-button Enter left the dialog open before preventDefault was narrowed to modifier-Enter. Final relevant test independently passed in the reviewer run above. The reviewer did not recreate those earlier source versions.
- No duplicate full suites, build, integration or Playwright run. D129 and bounded assignment supersede the role's generic full-suite instruction.
- Security and integrated UX/QA/performance gates remain separate. Reserved height and wrapping are present in source; final geometry, mobile selection, reduced-motion rendering, real chunk recovery and route bundle size require integrated browser/performance verification. No visual or performance sign-off is claimed here.
- Orchestrator follow-up found a parent-shortcut conflict in the installed HardBreak/ProseMirror keymaps. The bounded runtime delta keeps Shift+Enter and bypasses non-composing Ctrl/Cmd+Enter without preventing default or propagation. The engineer reproduced both modifier failures before fixing them; final runtime **9/9**, lint/format/typecheck passed. The orchestrator inspected this small delta under D129; integrated native-browser Save remains a PAGE gate.
- Added an engineering-self-check for third-party keymap ownership of the parent save shortcut.
- Orchestrator-reviewed follow-up supplies the standard runtime-only [UndoRedo extension](https://tiptap.dev/docs/editor/extensions/functionality/undo-redo), pinned 3.34.0. Engineer evidence: typed text failed to undo before the change; equal-content baseline adoption also retained discarded history before the fix. Final **12/12 runtime tests**, lint/format/typecheck passed. Changed resetKey rebuilds plugin state while preserving equal document/selection/editor identity; ordinary unchanged-key updates retain history. The orchestrator reran the dependency audit successfully after the fifteenth Tiptap package was added. Integrated browser/security checks remain required.

**Verdict: APPROVED** for the bounded F10-B source slice; integration and publication gates remain open.
