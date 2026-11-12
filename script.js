const STORAGE_KEY = "prompts";
const PREVIEW_WORDS = 12;

const form = document.getElementById("prompt-form");
const titleInput = document.getElementById("prompt-title");
const contentInput = document.getElementById("prompt-content");
const promptList = document.getElementById("prompt-list");
const emptyState = document.getElementById("empty-state");

function loadPrompts() {
  try {
    const prompts = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    return prompts.map((p) => ({ ...p, rating: p.rating ?? 0 }));
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

    const footer = document.createElement("div");
    footer.className = "card-footer";
    footer.append(createStarRating(prompt), deleteBtn);

    card.append(title, content, footer);
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
  prompts.unshift({ id: Date.now().toString(), title, content, rating: 0 });
  savePrompts(prompts);

  form.reset();
  titleInput.focus();
  render();
});

render();
