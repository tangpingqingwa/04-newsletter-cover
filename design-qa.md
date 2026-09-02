# Design QA — claim control alignment, iteration 2

## Evidence

- Source visual truth: `/Users/yann/outbid-verticals/04-newsletter-cover/artifacts/design-qa/claim-line-source-r2.png`
- Density-normalized source: `/Users/yann/outbid-verticals/04-newsletter-cover/artifacts/design-qa/claim-line-source-normalized-1200x745.png`
- Browser-rendered implementation: `/Users/yann/outbid-verticals/04-newsletter-cover/artifacts/design-qa/claim-line-after-desktop-1200x745.png`
- Mobile implementation: `/Users/yann/outbid-verticals/04-newsletter-cover/artifacts/design-qa/claim-line-after-mobile-390x844.png`
- Full comparison, source left and implementation right: `/Users/yann/outbid-verticals/04-newsletter-cover/artifacts/design-qa/claim-line-comparison-full.png`
- Focused claim comparison, source left and implementation right: `/Users/yann/outbid-verticals/04-newsletter-cover/artifacts/design-qa/claim-line-comparison-focused.png`
- State: open, honest empty cover; disabled Claim rank action; light print theme.
- Desktop viewport: `1200 x 745` CSS px at density `1`. The `2400 x 1664` source included `174px` of browser chrome; its `2400 x 1490` page region was cropped and downsampled to `1200 x 745` before comparison.
- Mobile viewport: `390 x 844` CSS px at density `1`; implementation screenshot is `390 x 844` pixels.

## Findings

- No actionable P0, P1, or P2 findings remain.
- Fonts and typography: the display face, uppercase hierarchy, optical weight, line height, and bid underline are unchanged; the label now centers on the square controls instead of sharing their baseline.
- Spacing and layout rhythm: the label-to-minus gap is `4px` instead of `8.796875px`; their center-line delta is `0px` instead of `9px`. The amount stepper and desktop Claim rank action remain aligned within `0.046875px`.
- Colors and visual tokens: unchanged; the paper, ink, flag red, hairline, and muted disabled tokens remain intact.
- Image quality and assets: no image, logo, illustration, icon, or generated asset was added or replaced.
- Copy and content: unchanged; the fixture still shows the valid `$5` product minimum and honest empty-cover state.
- Responsiveness: at `390 x 844`, the label and stepper use the same centered flex row, keep a `4px` gap, retain a `0.00390625px` center delta, and produce `0px` horizontal overflow. Claim rank correctly returns to its own mobile row.
- Interaction: increase and decrease were exercised from `$5 → $6 → $5`; state restored correctly. Browser console errors: none.

## Comparison History

1. Earlier P2 — the amount stepper and desktop Claim rank action were separated by `103.7421875px` between centers.
2. Earlier fix — scoped Claim rank to the desktop claim-control line and retained the two identity fields below it; the resulting center delta was `0.0390625px`.
3. Current P2 — baseline alignment left the label center `9px` above the minus box and retained an `8.796875px` gap.
4. Current fix — changed the claim heading to center alignment, reduced its gap to `0.25rem`, preserved that flex treatment on mobile, and retuned the desktop Claim rank offset to `1.25rem`.
5. Post-fix evidence — the focused comparison shows label, minus, amount, plus, and Claim rank on the intended control line; desktop label/control delta is `0px`, Claim rank/stepper delta is `0.046875px`, and mobile remains overflow-free.

## Open Questions

- None for this scoped alignment correction.

## Verification

- `npm run typecheck`: passed.
- `npm test`: 112 passed, 0 failed.
- `GET /healthz`: passed.
- `git diff --check`: passed.
- Desktop/mobile Chrome captures, stepper interaction, glyph containment, overflow, and console checks: passed.

## Implementation Checklist

- [x] Align `Claim #1 for` with the square controls.
- [x] Tighten the label-to-minus gap.
- [x] Keep desktop Claim rank on the same control line.
- [x] Preserve normal mobile flow and both identity fields.

## Follow-up Polish

- None required for this scoped correction.

final result: passed

## Maker contact footer · 2026-09-01

- Source visual truth: `/var/folders/wr/2073jwr96_q68h23sfdqtvf00000gn/T/codex-clipboard-856d0520-4293-4865-a587-ff7cf0f23936.png` (`2400 x 1664`, browser chrome included).
- Browser-rendered implementation: `/Users/yann/chat2/artifacts/design-qa/2026-09-01-maker-footer/04-desktop.jpg` (`1200 x 689`) and `/Users/yann/chat2/artifacts/design-qa/2026-09-01-maker-footer/04-mobile.jpg` (`390 x 844`), normalized in the shared comparison sheets.
- State: cover claim desk, footer navigation visible, maker-email link keyboard-focused.
- Full-view evidence: the author contact follows the cover/archive navigation as a quiet folio colophon and stays within the centered newspaper sheet.
- Focused evidence: one visible marker; exact copy/href; `2px` visible focus outline; `0px` horizontal overflow on both targets.
- Required surfaces: condensed print typography, thin-rule spacing, black/red/ivory tokens, and concise copy remain coherent; no imagery/icons were required.
- Findings: P0 `0`, P1 `0`, P2 `0`; source social/badge elements were not part of the requested minimal email contact.
- Comparison history: pass 1 found no actionable P0/P1/P2 issue; no correction loop was required.
- Regression: `113/113` fixture tests passed; Waffo/payment code was untouched.

final result: passed

## Prelaunch public-copy cleanup — 2026-08-31

- Chrome routes checked: home, About, and Rules at the normal desktop viewport and `390 x 844`.
- Public copy contains no clone, development, test-fixture, internal field-name, or payment-provider implementation language.
- Claim controls share one visual centerline; amount decoration is clean and the step buttons stay inside their boxes.
- Responsive result: no horizontal document overflow on any checked route.
- Regression result: `npm test` passed `112/112`; `git diff --check` passed.
- Payment behavior remains unchanged; customer-facing wording is provider-neutral while Waffo stays internal.

---

# Design QA — dollar underline removal (2026-08-31)

## Evidence

- Source visual truth: `/var/folders/wr/2073jwr96_q68h23sfdqtvf00000gn/T/codex-clipboard-c7a079c8-3b1a-4024-ae1e-ae43d1ab390b.png`
- Single source-versus-render comparison: `/Users/yann/chat2/artifacts/design-qa/2026-08-31-dollar-underline/comparison-source-vs-ten-sites.png`
- Newsletter cover desktop render: `/Users/yann/chat2/artifacts/design-qa/2026-08-31-dollar-underline/4214-desktop-full.png`
- Newsletter cover mobile render: `/Users/yann/chat2/artifacts/design-qa/2026-08-31-dollar-underline/4214-mobile-full.png`
- Focused desktop amount crop: `/Users/yann/chat2/artifacts/design-qa/2026-08-31-dollar-underline/4214-desktop-amount.png`
- Focused mobile amount crop: `/Users/yann/chat2/artifacts/design-qa/2026-08-31-dollar-underline/4214-mobile-amount.png`

## Findings

- No actionable P0, P1, or P2 findings remain for this scoped correction.
- The dollar sign and numeric value render with `text-decoration-line: none`; the amount wrapper and input both have `border-bottom-style: none` and `border-bottom-width: 0px`.
- Existing typography, spacing, buttons, project skin, and Waffo payment behavior are unchanged.
- Existing keyboard focus selectors remain in place; only the persistent dashed amount decoration was removed.
- At `390 x 844`, the amount control remains inside the viewport with no horizontal overflow.
- Increase/decrease interaction passed: `$5 → $6 → $5`.
- Chrome console errors: `0`.

## Comparison History

1. Source defect — a dashed line appeared directly below the dollar amount.
2. Fix — removed the amount wrapper/input underline or dashed bottom border without changing form geometry.
3. Post-fix evidence — desktop and mobile crops show the amount cleanly, while controls stay aligned and interactive.

## Verification

- `npm test`: passed, 0 failed.
- `git diff --check`: passed.
- Chrome desktop computed-style check: passed.
- Chrome `390 x 844` responsive computed-style and containment check: passed.
- Chrome amount stepper interaction and console checks: passed.

## Follow-up Polish

- None required for this scoped correction.

final result: passed
