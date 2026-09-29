---
ai_description: |
  Root of Event Beast documentation (schema v2).
  Agents own everything under library/ except notes/, which is human-only.
  Sub-trees: knowledge/ (public and private docs), requirements/ (PRDs),
  issues/ (IRDs), notes/ (human scratch, read-only to agents).
human_description: |
  Documentation root for Event Beast.
  - requirements/: planned product work (PRDs)
  - issues/: bug and incident work (IRDs)
  - knowledge/: reference docs, when they exist
  - notes/: only humans write here
---

# Library

Documentation root for Event Beast. Schema version: **v2**.

Operational runbooks that already exist stay in `docs/`. New product plans live here.

## Top-level layout

| Folder | What goes here |
|---|---|
| `requirements/` | Product and feature work: PRDs in backlog, in-work, and completed |
| `issues/` | Reactive bug and incident work |
| `knowledge/` | Reference documentation, split by audience |
| `notes/` | Human-only scratch space |
