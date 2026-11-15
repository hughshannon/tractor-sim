---
name: Farm save safety
description: Rationale for local save protection and paused offline progression
---

Treat an unreadable or unsupported save as player-owned data, not disposable cache. Do not automatically replace it with a fresh farm.

**Why:** A safe-looking fallback followed by autosave would permanently erase progress that a later compatible loader might recover.

**How to apply:** Future compatibility changes should either migrate and validate the entire save or require an explicit fresh-start action that preserves the original.

Offline time intentionally does not advance crop growth or market time.

**Why:** This task adds continuity across reloads, not an offline simulation mechanic; returning should restore the farm as the player left it.

**How to apply:** Treat offline progression as a separate gameplay change rather than adding elapsed wall-clock time during save loading.
