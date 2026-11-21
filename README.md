# Prompt Library

A lightweight prompt library written in plain HTML, CSS and JavaScript inspired by ([dev.masters course](https://master.dev/courses/prompt-engineering/))
Save your AI prompts, rate how well they work, add notes, track which model each prompt is for, and export or import the whole library as JSON.

There are no dependencies and no build step. Your data stays in your browser's `localStorage`.

## Features

- **Save prompts.** Each prompt has a title, content and model name. Cards show a short preview of the content.
- **5-star rating.** Click a star to rate a prompt, or click the current rating again to clear it. Hovering previews the rating, and the stars work with a keyboard and screen reader.
- **Notes.** Add, edit and delete notes on each prompt. Only one note is edited at a time.
- **Metadata tracking.** Each prompt records:
  - the model it's for
  - when it was created and last updated
  - an estimated token range, with a colour-coded confidence level (high / medium / low)

  Prompts are listed newest first.
- **Export and import.**
  - Export downloads the whole library as a versioned JSON file with summary statistics.
  - Import checks the file first. You can then merge it with your current prompts or replace them, and choose what happens to each prompt whose ID already exists.
  - Your data is backed up before every import and restored if the import fails.
- **Dark developer theme.** The page works on phones as well as desktop.

## Getting started

```bash
git clone <your-repo-url>
cd prompt-for-fun
open index.html   # or double-click it, or serve the folder with any static server
```

That's all: there's nothing to install.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | Page layout: form, prompt list, import/export toolbar, dialog |
| `styles.css` | All styling, with the theme colours defined as CSS variables in `:root` |
| `metadata.js` | `trackModel`, `updateTimestamps`, `estimateTokens`, input checks and the metadata panel on each card |
| `script.js` | Saving and loading, card rendering, star rating and notes |
| `io.js` | Export, import, file checks, duplicate-ID handling, backup and rollback |

The scripts load in this order: `metadata.js`, then `script.js`, then `io.js`.

## Data model

Prompts are stored as a JSON array under the `localStorage` key `prompts`:

```js
{
  id: "1731400000000",
  title: "Code Reviewer",
  content: "Review this code for bugs and readability...",
  rating: 4,                       // 0 = unrated, 1–5 stars
  notes: [
    { id: "1731500000000", text: "Works best with small diffs" }
  ],
  metadata: {
    model: "Claude Opus 5.5",      // non-empty, max 100 characters
    createdAt: "2026-11-14T08:17:53.197Z",
    updatedAt: "2026-11-14T09:02:11.004Z",
    tokenEstimate: { min: 7, max: 14, confidence: "high" }
  }
}
```

Prompts saved before ratings, notes or metadata existed are filled in when they're loaded. They get model `"Unknown"`, and their creation time is taken from their ID.

### Token estimate

- `min = 0.75 × word count`
- `max = 0.25 × character count`
- Both are multiplied by 1.3 when **Contains code** is checked.
- Confidence is based on `max`: **high** under 1,000, **medium** from 1,000 to 5,000, **low** above 5,000.

This is a rough heuristic, not a real tokenizer.

### What updates `updatedAt`

Rating a prompt, or adding, editing or deleting one of its notes.

## Export format

```json
{
  "version": 1,
  "exportedAt": "2026-11-14T08:17:53.197Z",
  "stats": {
    "totalPrompts": 3,
    "averageRating": 4.5,
    "mostUsedModel": "Claude Opus 5.5"
  },
  "prompts": [ ]
}
```

- `averageRating` counts rated prompts only. It is `null` when no prompt is rated.
- Files are named like `prompt-library-2026-11-14T08-17-53.json`.

### Import

An import goes through these steps:

1. **Check the file:** valid JSON, a supported `version`, a `prompts` array, valid fields on each prompt, and no repeated IDs within the file. Any problem stops the import and lists exactly what's wrong.
2. **Choose a mode:** **Merge** with your existing prompts, or **Replace** them.
3. **When merging, settle each duplicate ID:** keep existing, use imported, keep both (the copy gets a new ID), or cancel. A checkbox applies your choice to all remaining duplicates.
4. **Save safely:** your current data is copied to `localStorage["prompts_backup"]`, the new data is written and checked, and your previous data is restored if anything fails.

## Browser support

The app works in any recent version of Chrome, Edge, Firefox or Safari. The import dialogs use the native `<dialog>` element.

Because data lives in `localStorage`, each browser and profile has its own library, and clearing site data deletes it. Use **Export** to keep backups.
