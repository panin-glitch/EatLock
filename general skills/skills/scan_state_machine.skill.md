# Scan State Machine — MUST OBEY

## Session fields (source of truth)
- mode: "meal" | "barcode"
- beforeImageUri?: string
- afterImageUri?: string
- barcode?: string

## Absolute invariants
1) Post-scan MUST NOT call verifyFood().
2) If beforeImageUri exists, post-scan MUST call compareMeal(before, after).
3) After images may be empty plates and MUST be accepted as valid input to compareMeal().
4) Routing depends ONLY on session fields, not model output.