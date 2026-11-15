// Export / import of the prompt library as a JSON file.
// Depends on metadata.js (validators) and script.js (normalizePrompt, savePrompts, render).
//
// Export file schema (version 1):
// {
//   version: 1,
//   exportedAt: "2026-11-14T08:17:53.197Z",
//   stats: { totalPrompts: 3, averageRating: 4.5 | null, mostUsedModel: "Claude Opus 5.5" | null },
//   prompts: [ { id, title, content, rating, notes: [{ id, text }], metadata: {...} } ]
// }

const EXPORT_VERSION = 1;
const BACKUP_KEY = "prompts_backup";
const MAX_ERRORS_SHOWN = 10;
const CONFIDENCE_LEVELS = ["high", "medium", "low"];

const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");
const ioStatus = document.getElementById("io-status");

const dialog = document.getElementById("app-dialog");
const dialogTitle = document.getElementById("dialog-title");
const dialogMessage = document.getElementById("dialog-message");
const dialogActions = document.getElementById("dialog-actions");
const dialogApplyAll = document.getElementById("dialog-apply-all");
const dialogApplyAllInput = document.getElementById("dialog-apply-all-input");

// Error that carries a list of detailed problems for display.
class DetailedError extends Error {
  constructor(message, details = []) {
    super(message);
    this.details = details;
  }
}

// ---- Validation ----

// Returns a list of problems with one prompt (empty list = valid).
function validatePrompt(p, path) {
  const errors = [];
  if (!p || typeof p !== "object" || Array.isArray(p)) {
    return [`${path}: must be an object`];
  }

  if (typeof p.id !== "string" || p.id.trim() === "") errors.push(`${path}.id: must be a non-empty string`);
  if (typeof p.title !== "string" || p.title.trim() === "") errors.push(`${path}.title: must be a non-empty string`);
  if (typeof p.content !== "string" || p.content.trim() === "") errors.push(`${path}.content: must be a non-empty string`);
  if (!Number.isInteger(p.rating) || p.rating < 0 || p.rating > 5) errors.push(`${path}.rating: must be a whole number from 0 to 5`);

  if (!Array.isArray(p.notes)) {
    errors.push(`${path}.notes: must be an array`);
  } else {
    p.notes.forEach((n, i) => {
      if (!n || typeof n.id !== "string" || n.id === "") errors.push(`${path}.notes[${i}].id: must be a non-empty string`);
      if (!n || typeof n.text !== "string" || n.text.trim() === "") errors.push(`${path}.notes[${i}].text: must be a non-empty string`);
    });
  }

  const m = p.metadata;
  if (!m || typeof m !== "object") {
    errors.push(`${path}.metadata: must be an object`);
    return errors;
  }
  const check = (fn) => { try { fn(); } catch (err) { errors.push(`${path}.metadata: ${err.message}`); } };
  check(() => validateModelName(m.model));
  check(() => validateISODate(m.createdAt, "createdAt"));
  check(() => validateISODate(m.updatedAt, "updatedAt"));
  if (typeof m.createdAt === "string" && typeof m.updatedAt === "string" && m.updatedAt < m.createdAt) {
    errors.push(`${path}.metadata: updatedAt cannot be earlier than createdAt`);
  }
  const t = m.tokenEstimate;
  if (!t || typeof t !== "object") {
    errors.push(`${path}.metadata.tokenEstimate: must be an object`);
  } else {
    if (!Number.isFinite(t.min) || t.min < 0) errors.push(`${path}.metadata.tokenEstimate.min: must be a number ≥ 0`);
    if (!Number.isFinite(t.max) || t.max < 0) errors.push(`${path}.metadata.tokenEstimate.max: must be a number ≥ 0`);
    if (!CONFIDENCE_LEVELS.includes(t.confidence)) errors.push(`${path}.metadata.tokenEstimate.confidence: must be high, medium or low`);
  }
  return errors;
}

// Validates a list of prompts, including duplicate IDs within the list.
function validatePromptList(prompts, label) {
  const errors = [];
  const seen = new Set();
  prompts.forEach((p, i) => {
    errors.push(...validatePrompt(p, `${label}[${i}]`));
    if (p && typeof p.id === "string") {
      if (seen.has(p.id)) errors.push(`${label}[${i}].id: duplicate ID "${p.id}" appears more than once`);
      seen.add(p.id);
    }
  });
  return errors;
}

// Reads stored prompts strictly: unlike loadPrompts(), corrupt data throws instead of returning [].
function readStoredPrompts() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Stored data is not valid JSON (${err.message}).`);
  }
  if (!Array.isArray(parsed)) throw new Error("Stored data is not a list of prompts.");
  return parsed.map((p) => (p && typeof p === "object" ? normalizePrompt(p) : p));
}

// ---- Export ----

function computeStats(prompts) {
  const rated = prompts.filter((p) => p.rating > 0);
  const averageRating = rated.length
    ? Math.round((rated.reduce((sum, p) => sum + p.rating, 0) / rated.length) * 100) / 100
    : null; // only rated prompts count; null when nothing is rated

  const modelCounts = {};
  prompts.forEach((p) => { modelCounts[p.metadata.model] = (modelCounts[p.metadata.model] || 0) + 1; });
  let mostUsedModel = null;
  let topCount = 0;
  for (const [model, count] of Object.entries(modelCounts)) {
    if (count > topCount) { mostUsedModel = model; topCount = count; }
  }

  return { totalPrompts: prompts.length, averageRating, mostUsedModel };
}

function exportPrompts() {
  try {
    const prompts = readStoredPrompts();
    if (prompts.length === 0) {
      showStatus("There are no prompts to export.", "info");
      return;
    }

    const errors = validatePromptList(prompts, "prompts");
    if (errors.length) {
      throw new DetailedError("Export stopped: some saved prompts are invalid.", errors);
    }

    const exportedAt = new Date().toISOString();
    const data = { version: EXPORT_VERSION, exportedAt, stats: computeStats(prompts), prompts };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    // e.g. prompt-library-2026-11-14T08-17-53.json
    link.download = `prompt-library-${exportedAt.slice(0, 19).replace(/:/g, "-")}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showStatus(`Exported ${prompts.length} prompt${prompts.length === 1 ? "" : "s"}.`, "success");
  } catch (err) {
    showError(err);
  }
}

// ---- Import ----

// Checks the file's structure and version, and returns its normalized prompts.
function parseImportFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`The file is not valid JSON (${err.message}).`);
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The file is not a prompt library export (expected a JSON object).");
  }
  if (!Number.isInteger(data.version) || data.version < 1) {
    throw new Error("The file has no valid version number, so it is not a prompt library export.");
  }
  if (data.version > EXPORT_VERSION) {
    throw new Error(`The file was made by a newer version of the app (v${data.version}). This app supports up to v${EXPORT_VERSION}.`);
  }
  if (!Array.isArray(data.prompts)) {
    throw new Error('The file has no "prompts" list.');
  }

  let prompts;
  try {
    prompts = data.prompts.map((p) => (p && typeof p === "object" ? normalizePrompt(p) : p));
  } catch (err) {
    throw new DetailedError("The file contains prompts that could not be read.", [err.message]);
  }

  const errors = validatePromptList(prompts, "prompts");
  if (errors.length) {
    throw new DetailedError(`The file has ${errors.length} problem${errors.length === 1 ? "" : "s"}. Nothing was imported.`, errors);
  }
  return prompts;
}

// Unique enough for a second copy of a prompt; avoids collisions within one import.
function generateId() {
  return Date.now().toString() + "-" + Math.random().toString(36).slice(2, 8);
}

// Side-by-side summary of the two versions of a conflicting prompt.
function describeConflict(existing, incoming) {
  const wrapper = document.createElement("div");

  const intro = document.createElement("p");
  intro.textContent = `A prompt with ID "${existing.id}" already exists. Which version do you want to keep?`;
  wrapper.appendChild(intro);

  const grid = document.createElement("div");
  grid.className = "conflict-grid";
  [["Existing", existing], ["Imported", incoming]].forEach(([label, p]) => {
    const col = document.createElement("dl");
    col.className = "conflict-col";
    const heading = document.createElement("h4");
    heading.textContent = label;
    col.appendChild(heading);
    [
      ["Title", p.title],
      ["Model", p.metadata.model],
      ["Rating", p.rating ? "★".repeat(p.rating) : "unrated"],
      ["Notes", String(p.notes.length)],
      ["Updated", formatDate(p.metadata.updatedAt)],
    ].forEach(([k, v]) => {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      col.append(dt, dd);
    });
    grid.appendChild(col);
  });
  wrapper.appendChild(grid);
  return wrapper;
}

// Merges imported prompts into existing ones, asking about each duplicate ID.
// Returns null if the user cancels.
async function mergePrompts(existing, imported) {
  const result = existing.map((p) => ({ ...p }));
  const indexById = new Map(result.map((p, i) => [p.id, i]));
  const counts = { added: 0, replaced: 0, keptBoth: 0, skipped: 0 };
  let rememberedChoice = null;

  for (const incoming of imported) {
    if (!indexById.has(incoming.id)) {
      result.push(incoming);
      indexById.set(incoming.id, result.length - 1);
      counts.added++;
      continue;
    }

    let choice = rememberedChoice;
    if (!choice) {
      const answer = await askChoice({
        title: "Duplicate prompt",
        message: describeConflict(result[indexById.get(incoming.id)], incoming),
        showApplyAll: true,
        choices: [
          { label: "Keep existing", value: "existing" },
          { label: "Use imported", value: "imported" },
          { label: "Keep both", value: "both", primary: true },
          { label: "Cancel import", value: "cancel", danger: true },
        ],
      });
      if (answer.choice === "cancel") return null;
      choice = answer.choice;
      if (answer.applyToAll) rememberedChoice = choice;
    }

    if (choice === "existing") {
      counts.skipped++;
    } else if (choice === "imported") {
      result[indexById.get(incoming.id)] = incoming;
      counts.replaced++;
    } else {
      const copy = { ...incoming, id: generateId() };
      result.push(copy);
      indexById.set(copy.id, result.length - 1);
      counts.keptBoth++;
    }
  }
  return { prompts: result, counts };
}

// Saves new data with a backup first; restores the previous data if anything fails.
function commitWithBackup(newPrompts) {
  const previousRaw = localStorage.getItem(STORAGE_KEY);

  try {
    localStorage.setItem(BACKUP_KEY, previousRaw ?? "[]");
  } catch (err) {
    throw new Error(`Could not back up your current data before importing (${describeStorageError(err)}). Nothing was changed.`);
  }

  try {
    savePrompts(newPrompts);
    // Verify the write round-trips before declaring success
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(saved) || saved.length !== newPrompts.length) {
      throw new Error("the saved data did not match what was imported");
    }
  } catch (err) {
    try {
      if (previousRaw === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, previousRaw);
    } catch (rollbackErr) {
      throw new Error(
        `Import failed (${describeStorageError(err)}) and restoring your previous data also failed ` +
        `(${describeStorageError(rollbackErr)}). A copy of your previous data is in localStorage under "${BACKUP_KEY}".`
      );
    }
    throw new Error(`Import failed (${describeStorageError(err)}). Your previous data was restored.`);
  }
}

function describeStorageError(err) {
  if (err && (err.name === "QuotaExceededError" || err.code === 22)) {
    return "browser storage is full";
  }
  return err && err.message ? err.message : String(err);
}

async function importPrompts(file) {
  try {
    let text;
    try {
      text = await file.text();
    } catch (err) {
      throw new Error(`Could not read the file "${file.name}" (${err.message}).`);
    }

    const imported = parseImportFile(text);
    if (imported.length === 0) {
      showStatus("The file contains no prompts. Nothing was imported.", "info");
      return;
    }

    let existing;
    try {
      existing = readStoredPrompts();
    } catch (err) {
      throw new Error(`Your current data could not be read (${err.message}). Import stopped so it is not overwritten.`);
    }

    // Choose merge or replace (no need to ask when the library is empty)
    let mode = "replace";
    if (existing.length > 0) {
      const answer = await askChoice({
        title: `Import ${imported.length} prompt${imported.length === 1 ? "" : "s"}`,
        message: `You have ${existing.length} saved prompt${existing.length === 1 ? "" : "s"}. ` +
          "Merge adds the imported prompts to them and asks about any duplicate IDs. " +
          "Replace deletes your current prompts and keeps only the imported ones.",
        choices: [
          { label: "Merge", value: "merge", primary: true },
          { label: "Replace all", value: "replace", danger: true },
          { label: "Cancel", value: "cancel" },
        ],
      });
      if (answer.choice === "cancel") {
        showStatus("Import cancelled. Nothing was changed.", "info");
        return;
      }
      mode = answer.choice;
    }

    let finalPrompts;
    let summary;
    if (mode === "merge") {
      const merged = await mergePrompts(existing, imported);
      if (!merged) {
        showStatus("Import cancelled. Nothing was changed.", "info");
        return;
      }
      finalPrompts = merged.prompts;
      const { added, replaced, keptBoth, skipped } = merged.counts;
      summary = `Merged: ${added} added, ${replaced} replaced, ${keptBoth} kept as copies, ${skipped} skipped.`;
    } else {
      finalPrompts = imported;
      summary = `Replaced your library with ${imported.length} imported prompt${imported.length === 1 ? "" : "s"}.`;
    }

    commitWithBackup(finalPrompts);
    editing = null; // close any open note editor; its prompt may have changed
    render();
    showStatus(`${summary} Your previous data is backed up under "${BACKUP_KEY}".`, "success");
  } catch (err) {
    showError(err);
  }
}

// ---- UI helpers ----

// Opens the dialog and resolves with { choice, applyToAll }. Esc counts as "cancel".
function askChoice({ title, message, choices, showApplyAll = false }) {
  return new Promise((resolve) => {
    dialogTitle.textContent = title;
    dialogMessage.replaceChildren(typeof message === "string" ? document.createTextNode(message) : message);
    dialogApplyAll.hidden = !showApplyAll;
    dialogApplyAllInput.checked = false;

    dialogActions.replaceChildren(...choices.map((c) => {
      const btn = document.createElement("button");
      btn.value = c.value;
      btn.textContent = c.label;
      btn.className = "btn-small" + (c.primary ? " btn-primary" : "") + (c.danger ? " btn-danger" : "");
      return btn;
    }));

    dialog.returnValue = "";
    dialog.addEventListener("close", () => {
      resolve({ choice: dialog.returnValue || "cancel", applyToAll: dialogApplyAllInput.checked });
    }, { once: true });
    dialog.showModal();
    dialogActions.querySelector(".btn-primary")?.focus();
  });
}

function showStatus(message, type = "info", details = []) {
  ioStatus.className = `io-status io-status-${type}`;
  const text = document.createElement("p");
  text.textContent = message;
  ioStatus.replaceChildren(text);

  if (details.length) {
    const list = document.createElement("ul");
    details.slice(0, MAX_ERRORS_SHOWN).forEach((d) => {
      const li = document.createElement("li");
      li.textContent = d;
      list.appendChild(li);
    });
    if (details.length > MAX_ERRORS_SHOWN) {
      const li = document.createElement("li");
      li.textContent = `…and ${details.length - MAX_ERRORS_SHOWN} more`;
      list.appendChild(li);
    }
    ioStatus.appendChild(list);
  }
  ioStatus.hidden = false;
}

function showError(err) {
  console.error(err);
  showStatus(err.message, "error", err.details || []);
}

// ---- Wiring ----

exportBtn.addEventListener("click", exportPrompts);
importBtn.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", () => {
  const file = importFile.files[0];
  importFile.value = ""; // allow choosing the same file again later
  if (file) importPrompts(file);
});
