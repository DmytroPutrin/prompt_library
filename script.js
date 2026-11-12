const STORAGE_KEY = "prompts";
const PREVIEW_WORDS = 12;

const form = document.getElementById("prompt-form");
const titleInput = document.getElementById("prompt-title");
const contentInput = document.getElementById("prompt-content");
const promptList = document.getElementById("prompt-list");
const emptyState = document.getElementById("empty-state");

function loadPrompts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
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
  const prompts = loadPrompts();
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

    card.append(title, content, deleteBtn);
    promptList.appendChild(card);
  });
}

function deletePrompt(id) {
  savePrompts(loadPrompts().filter((p) => p.id !== id));
  render();
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = titleInput.value.trim();
  const content = contentInput.value.trim();
  if (!title || !content) return;

  const prompts = loadPrompts();
  prompts.unshift({ id: Date.now().toString(), title, content });
  savePrompts(prompts);

  form.reset();
  titleInput.focus();
  render();
});

render();
