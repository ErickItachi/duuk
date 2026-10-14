# DUUK Admin 2.0: design system and module guide

This guide is the contract for every screen of the DUUK Admin (`/admin`). The institutional site keeps its own styles; nothing here applies to it.

## Principles

- Neutral black, white and gray carry the interface. The DUUK coral (`--ds-accent`) is used sparingly and only where it means something: the active menu marker, unread counts, the highlighted series of a chart, a primary emphasis that needs color.
- No decorative gradients, glows or brown/orange washes. A gradient is allowed only as a functional scrim for text over a photograph.
- Icons come from `Icon` (`src/admin/components.jsx`, lucide). No emojis as icons.
- Positive and negative values always carry a sign, arrow or word, never color alone. Status colors (`--ds-success`, `--ds-warning`, `--ds-danger`, `--ds-info`) always come with text or an icon.
- Both themes (dark default, light, and system) must work through tokens alone. Do not hardcode hex colors in module CSS; the only exceptions are media (photos, video backgrounds) and third-party brand logos.
- Motion uses the motion tokens, stays under 320 ms, and is disabled by `prefers-reduced-motion` (global rule in `ds/base.css`).
- The DUUK logo PNG is never redrawn, cropped or boxed. In the light admin, only the menu/header brand uses `filter: var(--ds-logo-filter)`.

## Files

| File | Owns |
| --- | --- |
| `src/admin/ds/tokens.css` | Colors per theme, type scale, spacing, radius, controls, motion, layout. Also maps legacy variables (`--admin-ink`, `--admin-line`, `--coral`, …) to the new tokens. |
| `src/admin/ds/base.css` | Typography, focus ring, selection, scrollbars, reduced motion. Element resets use `:where()` so classes always win. |
| `src/admin/ds/components.css` | Buttons, fields, cards, KPIs, badges, tabs, toolbars, tables, pagination, alerts, empty and loading states, dialogs, toasts, menus. |
| `src/admin/shell/*` | Sidebar, top bar, phone tab bar, drawer, command palette (⌘K), shortcuts, settings frame, toasts, start screen. |
| Module CSS (`office.css`, `calendar.css`, `crm.css`, `mail.css`, `finance*.css`, `bank.css`, `ai.css`, `drive.css`, `settings.css`, …) | Only what is specific to that module. |

CSS order: design system first, module styles next, shell last. A module rule with the same specificity as a design-system rule wins, so remove module rules that only repeat what the design system already does.

## Tokens (most used)

- Surfaces: `--ds-bg`, `--ds-bg-subtle`, `--ds-surface`, `--ds-surface-2`, `--ds-surface-3`, `--ds-field`, `--ds-hover`, `--ds-active`, `--ds-selected`, `--ds-overlay`.
- Lines: `--ds-border`, `--ds-border-subtle`, `--ds-border-strong`.
- Text: `--ds-text`, `--ds-text-2` (secondary), `--ds-text-3` (tertiary/meta), `--ds-text-disabled`, `--ds-text-inverse`.
- Actions: `--ds-primary`, `--ds-primary-hover`, `--ds-on-primary`, `--ds-accent`, `--ds-accent-soft`, `--ds-accent-line`, `--ds-focus`.
- Status: `--ds-success|warning|danger|info` and their `-soft` backgrounds; `--ds-danger-solid` for destructive buttons.
- Charts: `--ds-chart-1` (primary series), `--ds-chart-2`, `--ds-chart-3`, `--ds-chart-accent` (highlight), `--ds-chart-grid`.
- Type: `--ds-font`, `--ds-font-display`; sizes `--ds-text-xs` 11, `-sm` 12, `-md` 13, `-base` 14, `-lg` 16, `-xl` 20, `-2xl` 24, `-3xl` 30; weights 400/500/600.
- Space (4 px grid): `--ds-space-1` 4 … `--ds-space-12` 48. Radius: `--ds-radius-xs` 4, `-sm` 6, `-md` 8, `-lg` 12, `-xl` 16, `-full`.
- Controls: `--ds-control-sm` 30, `-md` 36, `-lg` 44 (40/44 on touch screens).
- Motion: `--ds-ease-out`, `--ds-ease-in-out`, `--ds-ease-spring`, `--ds-duration-1` 120 … `-4` 320 ms.
- Elevation: `--ds-shadow-sm|md|lg`. Skeleton: `--ds-skeleton`, `--ds-skeleton-shine`.
- Layout: `--ds-gutter` (32/24/16 px), `--ds-content-max` 1360, `--ds-shell-top` (top bar height), `--ds-shell-bottom` (phone tab bar plus safe area; 0 elsewhere). Breakpoints: phone < 768, tablet 768–1199, desktop ≥ 1200.

## Components (class names)

- Page header: `PageTitle` from `src/admin/forms.jsx` (renders `.admin-page-title`; the eyebrow is hidden in 2.0, the title keeps the coral period). Actions go in its children (`.admin-title-actions`).
- Buttons: `.admin-button` (primary), `--secondary`, `--ghost`, `--danger`, `--accent`, `--sm`, `--block`; `.admin-icon-button` (+ `--danger`, `--bordered`); `.admin-text-button` (+ `--danger`). Always give icon-only buttons an `aria-label`.
- Surfaces: `.admin-panel` (flush container), `.ds-card` (padded card) with `.ds-card__head`; `.ds-section-head`; `.ds-divider`.
- KPIs: `.admin-stats` grid of `div` items (`span` label, `strong` value, `small` note) or `.ds-kpi` with `__label`, `__value`, `__note`.
- Badges: `.ds-badge` (+ `--success|warning|danger|info|accent|neutral`), legacy `.admin-status--published|draft|archived`, `.office-badge.is-*`; `.ds-count` for numeric counters.
- Fields: `.admin-field` (label `span`, input, `small` hint), `.admin-form-grid` (2 columns, 1 on phones), `.admin-field-row`, `.admin-input-prefix`, `.admin-check`, `.admin-password`, `.ds-input`, `.ds-select`. Inputs inside `.admin-field`, `.admin-form-grid`, `.platform-form` or `.office-form` are styled automatically. Validation: set `aria-invalid="true"` and show `.ds-field-error` (with `Icon name="alertCircle"`) under the field, linked with `aria-describedby`.
- Search and filters: `.admin-search` (icon + input), `.admin-filter-tabs` / `.ds-segmented` (buttons with `aria-pressed` or `aria-checked`), `.ds-tabs` (underline tabs), `.ds-toolbar` with `.ds-toolbar__filters`.
- Lists and tables: `.platform-list` / `.platform-row` (`__main`, `h2/h3`, `p`, `small`), `.admin-row-actions`, `.ds-table-wrap` + `.ds-table` (`th`, `td`, `.is-number`), `.ds-pagination` with `.ds-pagination__pages` buttons (`aria-current="page"`).
- Feedback: `.admin-error` (danger), `.ds-alert` + `--info|warning|success` (icon first), `.admin-tip`, `.admin-empty` / `.ds-empty` (icon, `h2/h3`, `p`, optional button), `LoadingPanel` and `QueryState` from `forms.jsx` (skeletons), `.ds-skeleton` (+ `--text`, `--title`, `--circle`), `.ds-progress` (+ `--accent`), `.ds-spinner`.
- Dialogs: `Modal` and `ConfirmModal` from `components.jsx`. Modal body goes in `.admin-modal__body`, actions in `.admin-modal__foot`. On phones dialogs become bottom sheets automatically. `ConfirmModal` styles destructive actions (labels starting with Excluir, Remover, Apagar, Desconectar, Revogar, Descartar, Sair sem salvar, Cancelar envio/agendamento/publicação) as danger; pass `tone="danger"` or `tone="default"` to override.
- Toasts: call the `notify(message, failed)` prop each page receives.
- Menus and tooltips: `.ds-menu`, `.ds-menu__item`, `.ds-menu__separator`, `.ds-menu__label`; `data-ds-tooltip="Texto"` on a positioned element for a hover/focus tooltip.
- Keyboard hints: `kbd.ds-kbd`.

### Shared React helpers

Use these instead of writing new ones:

- `src/admin/ds/list.js`: `usePagination(items, { pageSize: 25, resetKey })` returns `{ items, page, pageCount, total, from, to, setPage }`; pass the search text and filters as `resetKey` so the list returns to page 1 when they change. `matchesQuery(query, ...fields)` is accent- and case-insensitive. `normalizeText(value)`.
- `src/admin/forms.jsx`: `Pagination({ pager, noun })` (pair with `usePagination`; renders nothing for a single page), `SearchField({ value, onChange, label, placeholder })`, `EmptyState({ icon, title, children, action })`, `ErrorState({ children, onRetry })`, `FieldError({ id, children })`, `QueryState`, `LoadingPanel`, `PageTitle`, `Field`, `Avatar`.

## Responsive rules

- No horizontal page scroll at any width (320–1920). Wide content (kanban, wide tables, tab strips) scrolls inside its own container.
- Phones: one column, primary actions reachable at the bottom of forms (dialogs become sheets with sticky footers), touch targets at least 40 px, inputs at 16 px (global rule) to avoid iOS zoom, respect `env(safe-area-inset-*)`, and keep content clear of the tab bar with `--ds-shell-bottom` when something is fixed or sticky at the bottom.
- Tables with more than three columns become stacked cards on phones (use `data-label` on cells, or a separate card layout).
- Tablet: two columns at most for forms and cards unless the content is a grid of small items.

## Behavior expected in every module

- Loading uses skeletons (`LoadingPanel`/`QueryState`), never a blank screen or generic spinner alone.
- Errors are visible, explain what failed in plain Portuguese, and offer "Tentar novamente" where a retry makes sense. Network failures keep the data already shown.
- Empty states say what is missing and offer the next action when one exists.
- Long lists (more than about 25 items) get client-side pagination with `.ds-pagination`, plus search and the filters the data supports. Do not paginate lists whose order is edited by the user (portfolio ordering).
- Destructive actions always confirm with `ConfirmModal`.
- Forms validate before sending, show field-level errors, keep the user's input on failure, and disable the submit button while sending (`aria-busy`).
- Never change business rules, API calls, database writes, permissions or the data shown. The redesign changes presentation and usability only.

## Browser checks

Fictional data and an isolated Supabase double live in `tests/e2e/`. Nothing reaches the real project.

```
node tests/e2e/screens.mjs --out <dir> --routes /admin/agenda,/admin/contratos --widths 390,820,1440 --themes dark,light
```

Each run prints errors and layout issues (overflow) per screen and writes PNG screenshots plus `report.json` to `<dir>`. Look at the screenshots, not only the report.
