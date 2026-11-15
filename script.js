const STORAGE_KEY = "prompts";
const PREVIEW_WORDS = 12;

const form = document.getElementById("prompt-form");
const titleInput = document.getElementById("prompt-title");
const contentInput = document.getElementById("prompt-content");
const promptList = document.getElementById("prompt-list");
const emptyState = document.getElementById("empty-state");
const modelInput = document.getElementById("prompt-model");
const isCodeInput = document.getElementById("prompt-is-code");
const formError = document.getElementById("form-error");

// Prompts saved before metadata existed get a fallback, dated from their id (a Date.now() value).
function fallbackMetadata(prompt) {
  const ms = Number(prompt.id);
  const createdAt = new Date(Number.isFinite(ms) ? ms : Date.now()).toISOString();
  return {
    model: "Unknown",
    createdAt,
    updatedAt: createdAt,
    tokenEstimate: estimateTokens(prompt.content ?? "", false),
  };
}

// Fills in fields that older prompts (saved before ratings/notes/metadata existed) lack.
function normalizePrompt(p) {
  return {
    ...p,
    rating: p.rating ?? 0,
    notes: p.notes ?? [],
    metadata: p.metadata ?? fallbackMetadata(p),
  };
}

function loadPrompts() {
  try {
    const prompts = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    return prompts.map(normalizePrompt);
  } catch (err) {
    console.error("Could not load prompts:", err);
    return [];
  }
}

// Bumps updatedAt on a prompt; on failure keeps the old metadata so the change still saves.
function touch(prompt) {
  try {
    prompt.metadata = updateTimestamps(prompt.metadata);
  } catch (err) {
    console.error("Could not update timestamps:", err);
  }
}

function savePrompts(prompts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
}

function preview(text) {
  const words = text.trim().split(/\s+/);
  return words.length > PREVIEW_WORDS
    ? words.slice(0, PREVIEW_WORDS).join(" ") + "…"
    : words.join(" ");
}

function render() {
  // Newest first (ISO 8601 strings sort correctly as text)
  const prompts = loadPrompts().sort((a, b) =>
    b.metadata.createdAt.localeCompare(a.metadata.createdAt));
  promptList.innerHTML = "";
  emptyState.hidden = prompts.length > 0;

  prompts.forEach((prompt) => {
    const card = document.createElement("article");
    card.className = "prompt-card";

    const title = document.createElement("h3");
    title.textContent = prompt.title;

    const content = document.createElement("p");
    content.textContent = preview(prompt.content);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deletePrompt(prompt.id));

    const footer = document.createElement("div");
    footer.className = "card-footer";
    footer.append(createStarRating(prompt), deleteBtn);

    card.append(title, content, createMetadataDisplay(prompt.metadata), createNotesSection(prompt), footer);
    promptList.appendChild(card);
  });
}

// Tracks the star just clicked so it can "pop" after re-render
let justRated = null;

function setRating(promptId, value) {
  const prompts = loadPrompts();
  const prompt = prompts.find((p) => p.id === promptId);
  if (!prompt) return;
  prompt.rating = prompt.rating === value ? 0 : value;
  touch(prompt);
  savePrompts(prompts);
  justRated = { id: promptId, value };
  render();
  justRated = null;
  // Keep keyboard focus on the star that was activated
  const rating = promptList.querySelector(`.star-rating[data-prompt-id="${promptId}"]`);
  rating?.querySelector(`.star[data-value="${value}"]`)?.focus();
}

function createStarRating(prompt) {
  const wrapper = document.createElement("div");
  wrapper.className = "star-rating";
  wrapper.dataset.promptId = prompt.id;
  wrapper.setAttribute("role", "group");
  wrapper.setAttribute("aria-label", `Rating: ${prompt.rating} of 5`);

  for (let i = 1; i <= 5; i++) {
    const filled = i <= prompt.rating;
    const star = document.createElement("button");
    star.type = "button";
    star.className = "star" + (filled ? " filled" : "");
    star.textContent = filled ? "★" : "☆";
    star.dataset.value = i;
    star.setAttribute("aria-label", `Rate ${i} star${i > 1 ? "s" : ""}`);
    star.setAttribute("aria-pressed", String(filled));
    if (justRated && justRated.id === prompt.id && justRated.value === i) {
      star.classList.add("pop");
    }
    star.addEventListener("click", () => setRating(prompt.id, i));
    wrapper.appendChild(star);
  }

  // Hover preview: light up stars up to the hovered one
  wrapper.addEventListener("mouseover", (e) => {
    const value = Number(e.target.dataset.value);
    if (!value) return;
    wrapper.classList.add("previewing");
    wrapper.querySelectorAll(".star").forEach((s, idx) => {
      s.classList.toggle("preview", idx < value);
      s.textContent = idx < value ? "★" : "☆";
    });
  });
  wrapper.addEventListener("mouseleave", () => {
    wrapper.classList.remove("previewing");
    wrapper.querySelectorAll(".star").forEach((s) => {
      s.classList.remove("preview");
      s.textContent = s.classList.contains("filled") ? "★" : "☆";
    });
  });

  return wrapper;
}

// ---- Notes ----

// Only one note editor is open at a time across the whole app.
// noteId "new" means the "add note" editor is open for that prompt.
// draft holds the typed text so it survives re-renders (e.g. rating a prompt mid-edit).
let editing = null; // { promptId, noteId, draft } or null

function updatePromptNotes(promptId, change) {
  const prompts = loadPrompts();
  const prompt = prompts.find((p) => p.id === promptId);
  if (!prompt) return;
  prompt.notes = change(prompt.notes);
  touch(prompt);
  savePrompts(prompts);
}

function addNote(promptId, text) {
  updatePromptNotes(promptId, (notes) => [...notes, { id: Date.now().toString(), text }]);
  editing = null;
  render();
}

function updateNote(promptId, noteId, text) {
  updatePromptNotes(promptId, (notes) =>
    notes.map((n) => (n.id === noteId ? { ...n, text } : n)));
  editing = null;
  render();
}

function deleteNote(promptId, noteId) {
  updatePromptNotes(promptId, (notes) => notes.filter((n) => n.id !== noteId));
  render();
}

function startEditing(promptId, noteId, text) {
  editing = { promptId, noteId, draft: text };
  render();
  const input = promptList.querySelector(".note-input");
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function cancelEditing() {
  editing = null;
  render();
}

function isEditing(promptId, noteId) {
  return editing !== null && editing.promptId === promptId && editing.noteId === noteId;
}

function createSmallButton(label, className, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-small " + className;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function createNoteEditor(onSave) {
  const editor = document.createElement("div");
  editor.className = "note-editor";

  const input = document.createElement("textarea");
  input.className = "note-input";
  input.rows = 3;
  input.placeholder = "Write a note...";
  input.value = editing.draft;
  input.addEventListener("input", () => { editing.draft = input.value; });

  const actions = document.createElement("div");
  actions.className = "note-actions";
  actions.append(
    createSmallButton("Save", "btn-note-save", () => {
      const text = input.value.trim();
      if (text) onSave(text); // empty or whitespace-only: do nothing
    }),
    createSmallButton("Cancel", "btn-note-cancel", cancelEditing)
  );

  editor.append(input, actions);
  return editor;
}

function createNotesSection(prompt) {
  const section = document.createElement("div");
  section.className = "notes";

  const heading = document.createElement("h4");
  heading.className = "notes-title";
  heading.textContent = "Notes";
  section.appendChild(heading);

  if (prompt.notes.length > 0) {
    const list = document.createElement("ul");
    list.className = "notes-list";

    prompt.notes.forEach((note) => {
      const item = document.createElement("li");
      item.className = "note";

      if (isEditing(prompt.id, note.id)) {
        item.appendChild(createNoteEditor((text) => updateNote(prompt.id, note.id, text)));
      } else {
        const text = document.createElement("span");
        text.className = "note-text";
        text.textContent = note.text;

        const actions = document.createElement("div");
        actions.className = "note-actions";
        actions.append(
          createSmallButton("Edit", "btn-note-edit", () => startEditing(prompt.id, note.id, note.text)),
          createSmallButton("Delete", "btn-note-delete", () => deleteNote(prompt.id, note.id))
        );

        item.append(text, actions);
      }
      list.appendChild(item);
    });

    section.appendChild(list);
  }

  if (isEditing(prompt.id, "new")) {
    section.appendChild(createNoteEditor((text) => addNote(prompt.id, text)));
  } else {
    section.appendChild(
      createSmallButton("+ Add note", "btn-note-add", () => startEditing(prompt.id, "new", ""))
    );
  }

  return section;
}

function deletePrompt(id) {
  savePrompts(loadPrompts().filter((p) => p.id !== id));
  if (editing && editing.promptId === id) editing = null;
  render();
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = titleInput.value.trim();
  const content = contentInput.value.trim();
  if (!title || !content) return;

  try {
    const metadata = trackModel(modelInput.value, content, isCodeInput.checked);
    const prompts = loadPrompts();
    prompts.unshift({ id: Date.now().toString(), title, content, rating: 0, notes: [], metadata });
    savePrompts(prompts);
  } catch (err) {
    formError.textContent = err.message;
    formError.hidden = false;
    return;
  }

  formError.hidden = true;
  form.reset();
  titleInput.focus();
  render();
});

render();
