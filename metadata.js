// Metadata tracking for prompts: model name, timestamps and token estimates.
// Pure browser JavaScript, no dependencies. Loaded before script.js.

const MODEL_NAME_MAX_LENGTH = 100;
const CODE_MULTIPLIER = 1.3;
const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// Throws unless value is a real date in the exact format YYYY-MM-DDTHH:mm:ss.sssZ.
function validateISODate(value, fieldName) {
  if (typeof value !== "string" || !ISO_8601_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be an ISO 8601 string (YYYY-MM-DDTHH:mm:ss.sssZ), got: ${value}`);
  }
  // Round-trip check rejects impossible dates such as 2026-02-31
  const date = new Date(value);
  if (isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new Error(`${fieldName} is not a valid date: ${value}`);
  }
}

function validateModelName(modelName) {
  if (typeof modelName !== "string" || modelName.trim() === "") {
    throw new Error("Model name must be a non-empty string.");
  }
  if (modelName.trim().length > MODEL_NAME_MAX_LENGTH) {
    throw new Error(`Model name must be at most ${MODEL_NAME_MAX_LENGTH} characters (got ${modelName.trim().length}).`);
  }
}

/**
 * Estimates the token count of a text.
 *   min = 0.75 × word count
 *   max = 0.25 × character count
 *   both × 1.3 when isCode is true
 * Confidence is based on the max estimate: high < 1000, medium 1000–5000, low > 5000.
 */
function estimateTokens(text, isCode = false) {
  if (typeof text !== "string") {
    throw new Error("Text must be a string.");
  }
  if (typeof isCode !== "boolean") {
    throw new Error("isCode must be a boolean.");
  }

  const trimmed = text.trim();
  const wordCount = trimmed === "" ? 0 : trimmed.split(/\s+/).length;
  const charCount = text.length;
  const multiplier = isCode ? CODE_MULTIPLIER : 1;

  let min = Math.round(0.75 * wordCount * multiplier);
  let max = Math.round(0.25 * charCount * multiplier);
  // Very short words can make the word-based figure exceed the character-based one;
  // swap so the range always reads low → high.
  if (min > max) [min, max] = [max, min];

  let confidence;
  if (max < 1000) confidence = "high";
  else if (max <= 5000) confidence = "medium";
  else confidence = "low";

  return { min, max, confidence };
}

/**
 * Creates a new metadata object for a prompt.
 * isCode is an optional third argument passed through to estimateTokens.
 */
function trackModel(modelName, content, isCode = false) {
  validateModelName(modelName);
  if (typeof content !== "string") {
    throw new Error("Content must be a string.");
  }

  const now = new Date().toISOString();
  return {
    model: modelName.trim(),
    createdAt: now,
    updatedAt: now,
    tokenEstimate: estimateTokens(content, isCode),
  };
}

// Returns a copy of the metadata with updatedAt set to now.
function updateTimestamps(metadata) {
  if (!metadata || typeof metadata !== "object") {
    throw new Error("Metadata must be an object.");
  }
  validateISODate(metadata.createdAt, "createdAt");

  const updatedAt = new Date().toISOString();
  validateISODate(updatedAt, "updatedAt");
  if (new Date(updatedAt) < new Date(metadata.createdAt)) {
    throw new Error(`updatedAt (${updatedAt}) cannot be earlier than createdAt (${metadata.createdAt}).`);
  }

  return { ...metadata, updatedAt };
}

// Human-readable date, e.g. "Nov 14, 2026, 3:42 PM"
function formatDate(iso) {
  try {
    validateISODate(iso, "date");
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "Unknown date";
  }
}

// Builds the metadata block shown on a prompt card.
function createMetadataDisplay(metadata) {
  const wrapper = document.createElement("dl");
  wrapper.className = "metadata";

  const { min, max, confidence } = metadata.tokenEstimate;
  const rows = [
    ["Model", metadata.model],
    ["Tokens", min === max ? `~${max}` : `~${min}–${max}`],
    ["Created", formatDate(metadata.createdAt)],
    ["Updated", formatDate(metadata.updatedAt)],
  ];

  rows.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "metadata-row";

    const dt = document.createElement("dt");
    dt.textContent = label;

    const dd = document.createElement("dd");
    dd.textContent = value;

    if (label === "Model") dd.classList.add("metadata-model");
    if (label === "Tokens") {
      const badge = document.createElement("span");
      badge.className = `confidence confidence-${confidence}`;
      badge.textContent = confidence;
      badge.title = `Estimate confidence: ${confidence}`;
      dd.append(" ", badge);
    }

    row.append(dt, dd);
    wrapper.appendChild(row);
  });

  return wrapper;
}
