# Phase 1 — independent final visual review

Date: 2026-11-05. Scope: UI-05/06, SHOT-01..03 and the remaining gallery polish. Review uses local PNGs from the production-browser suite; it does not certify hosted Google sign-in or replace keyboard/axe tests.

**APPROVED for local Phase 1.** No blocking visual finding remains. The two minor horizontal-scroll dispositions below are explicit; the orchestrator owns the separate final automated/determinism gates.

| Area                  | Visual evidence checked                                                                                                              | Result                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Profile               | Admin desktop dark/mobile light; Finance mobile dark                                                                                 | Compact cards, full theme labels, readable role chips and history; logout uses a neutral icon; ineffective vertical selector absent                                      |
| MFA                   | Optional setup mobile light; verify mobile dark                                                                                      | Copy/deep-link/manual-key entry above the QR; optional exit and account-switch escape visible; final manual-key group wraps intact                                       |
| Denial                | Head Recruiter settings denial mobile light                                                                                          | Clear single 404/access-denial title and recovery action inside the permitted shell                                                                                      |
| Tablet navigation     | Open menu dark at 900 px                                                                                                             | Readable navigation, visible close action, no repeated date prefix behind overlay                                                                                        |
| Journal               | Mobile loading light; detail dark; expanded JSON light; desktop list light                                                           | Consistent filter geometry, full-width view toggle, parsed device/raw-UA disclosure, request-ID copying and stacked changes; desktop horizontal-scroll disposition below |
| Users and roles       | Users mobile dark; invitation mobile light; single-role removal mobile dark                                                          | Long status moved below identity; clear required labels, unified name terminology and singular removal copy                                                              |
| Lifecycle and states  | Deactivation mobile light; reset-MFA partial failure light; self card dark; list error desktop light                                 | Consequences and retry text readable; disabled self actions explain their reasons; recovery button is clear                                                              |
| Public sign-in/invite | Final valid invite mobile light; Google login mobile dark/invite desktop light; Google mismatch mobile light; sent state mobile dark | Pending person Марина Савчук and expiry agree with the caption; official Google mark visible; recovery/error copy readable without overflow                              |

## Findings

| ID                 | Severity                    | Component / screenshot                                                   | Required action                                                                                                                                                                                                                                                                             |
| ------------------ | --------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX-FINAL-01        | Closed                      | `mfa-setup-form.tsx`; `19-team-lead-mfa-setup-optional-mobile-light.png` | Fresh 21:32 capture confirms each four-character group remains intact when the manual key wraps.                                                                                                                                                                                            |
| UX-FINAL-02 / G-21 | Minor, accepted disposition | `role-matrix.tsx`; mobile invite and roles dialogs                       | The global checkbox starts at the first vertical column, but its label/hint wraps tightly into the remaining column width. The matrix supports horizontal scrolling; no action is inaccessible. Keep the current Foundation layout; a wider mobile global-role label remains visual polish. |
| UX-FINAL-03 / G-14 | Minor, accepted disposition | `audit-view.tsx`; desktop audit list at 1440 px                          | Fixed-width columns exceed the available settings content width, so result/IP columns require horizontal scrolling. This preserves stable columns and readable unbroken labels. A clearer scroll affordance is later polish; do not describe offscreen columns as absent.                   |

The orchestrator explicitly accepted the two nonblocking horizontal-scroll dispositions during closure. The final public refresh was rechecked; earlier stale invite/Google/key images have been replaced.

## Gallery integrity

- Both `screenshots/phase-1/` and `screenshots/latest/` contain **274 PNGs**. Their PNG bytes and `index.html` bytes match.
- Each gallery references **278 unique images**: the 274 local Phase-1 PNGs plus four relative links to the existing Foundation 404 captures. Every resolved image/link exists; no unlisted local PNG, duplicate image source or missing image alt text remains.
- Captions are Ukrainian and reflect the pending-invite example. The HTML contains no uppercase-label styling or developer `seed`/`CLAUDE.md` jargon.
- Representative fresh desktop/mobile and light/dark states were reviewed visually as listed above. Full pixel determinism and WCAG keyboard/axe results remain separate automated evidence; pixels alone cannot establish focus behavior or contrast compliance.

## Deterministic fixture recheck — 2026-11-06

**APPROVED for local screenshot gates C08 / SHOT-01..03.** Fresh default-order E2E passed 228 tests with one desktop-hover-only mobile skip; the public screenshot suite passed 52/52. Root retains responsibility for the remaining combined phase gates.

- The JSON and missing-record detail test exposed live audit rows beneath its translucent desktop overlay. It now answers the list with the existing fixed `SHOT_ROWS` and waits for those rows before capture; no application behavior changed.
- Both viewport variants of that test passed twice (2/2 each run). All **278 PNG SHA-256 hashes** match the snapshot taken between the two runs. Relative to the previous gallery baseline, only the four desktop JSON/missing-record light/dark images changed; the other 270 Phase-1 and four Foundation PNGs remain byte-identical.
- Fresh fixed desktop JSON/light, missing-record/dark and mobile JSON/dark captures were visually inspected: consistent fixture chronology, readable details and responsive layout. Mobile JSON expands to 1085 px to show the complete panel; the missing-record mobile capture remains 390×844.
- Phase-1/latest retain identical bytes for all 274 local PNGs and `index.html`. The gallery has 278 unique image sources, all resolving, with no missing image links or alt text. The two existing minor scroll dispositions remain unchanged.
