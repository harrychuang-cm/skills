# Seal

## Fingerprint

| Field | Value |
|---|---|
| Token contract summary | container fill per variant, ink rule, small corner |

## Anatomy

The default seal is a primary square with a white label.
The title plate uses primary-warm; the seal never does.
The stamp variant is an ink-strong disc with knockout text.

## Token Contract

| Component token | Maps to system token | Purpose | State / mode |
|---|---|---|---|
| --fx-comp-seal-container-color | --fx-sys-color-primary | container fill | default |
| --fx-comp-seal-text-color | --fx-sys-color-on-primary | content color | default |
| --fx-comp-seal-shape | --fx-sys-shape-corner-sm | corner | default |
| --fx-comp-seal-shape | --fx-sys-shape-corner-sm | corner (listed twice) | vertical |
| --fx-comp-seal-padding-block | --fx-sys-spacing-sm | block padding | default |
| --fx-comp-seal-padding-inline | --fx-sys-spacing-md | inline padding | default |
| --fx-comp-seal-rule-width | --fx-sys-stroke-thin | rule width | default |
| --fx-comp-seal-rule-color | --fx-sys-color-ink-strong | rule color | default |
| --fx-comp-seal-label-size | --fx-sys-typescale-label-size | label size | default |
| --fx-comp-seal-stamp-container-color | --fx-sys-color-ink-strong | container fill | stamp |
| --fx-comp-seal-stamp-text-color | --fx-sys-color-knockout | content color | stamp |

## Accessibility

White on primary must stay readable at label size.
