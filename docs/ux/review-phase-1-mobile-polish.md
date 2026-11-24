# UX review — gallery step C: mobile and 2FA exits

**2026-11-04 · APPROVED.** No blocking findings in this slice [UI-04..06, ROLE-05, SEC-AUTH-3, SHOT-01..03].

Reviewed the regenerated Phase-1 PNGs against `review-phase-1-gallery.md` G-07/08/09/12, the step-B optional-2FA finding, and `wireframes/settings-admin.md` §1.9. The new filter-sheet captures retain the native 390×844 viewport; list captures show the full page.

| Item                            | Result                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-07 — direct mobile navigation | Light/dark: «Профіль» and «Налаштування» are visible directly, with a clear active state and no lone «Ще». The tablet navigation overlay remains consistent.                                                                                                                                              |
| G-08 — compact user filters     | Light/dark: search and «Фільтри» share one row; the first card starts around y=357 rather than y=585. The sheet has readable checkbox labels, a scrollable body, a visible title and close control, and a fixed footer with «Скинути фільтри» above «Показати результати». Both footer actions are 48 px. |
| G-09 — invalid links            | Desktop/mobile, light/dark: confirm now says «Посилання недійсне» and provides «Отримати нове посилання». The invite error explains the next step and offers «Перейти до входу». Both secondary actions are full width, readable and 48 px high.                                                          |
| G-12 — touch targets            | Code inspection and QA geometry assertions cover the drawer audit/priority links, filter trigger/reset, checkbox labels, RoleMatrix and reactivation row. Auth and MFA exit heights are also asserted. No enlargement of the visual checkbox glyph was necessary.                                         |
| Optional / backup 2FA           | Desktop/mobile, light/dark: «Пізніше» / «Скасувати» is a clear full-width secondary action. Form, instructions and both actions fit the 390×844 screenshots without horizontal overflow or clipped text. Required MFA retains its existing eligibility rules.                                             |

## Directly inspected final images

Each stem below includes both `light` and `dark`:

- `03-public-confirm-invalid-{desktop,mobile}` and `04-public-invite-invalid-{desktop,mobile}`.
- `07-admin-navigation-direct-mobile` and `07-admin-navigation-open-tablet`.
- `08-admin-users-list-mobile` and `08-admin-users-filters-mobile`.
- `19-team-lead-mfa-setup-optional-{desktop,mobile}` and `19-admin-mfa-setup-backup-{desktop,mobile}`.

This approval closes step C only. Previously recorded P3 work, including settings-navigation clipping (G-30), drawer capture height (G-29), and mobile authenticator-key usability (RB-01), remains separate.
