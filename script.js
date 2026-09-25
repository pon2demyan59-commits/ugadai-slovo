const maxAttempts = 4;
const SCORE_STORAGE_KEY = "ugadai-slovo-score-v1";
const winsCountElement = document.querySelector("#winsCount");
const lossesCountElement = document.querySelector("#lossesCount");

function loadScore() {
  try {
    const saved = JSON.parse(localStorage.getItem(SCORE_STORAGE_KEY) || "{}");
    return {
      wins: Number.isSafeInteger(saved.wins) && saved.wins >= 0 ? saved.wins : 0,
      losses: Number.isSafeInteger(saved.losses) && saved.losses >= 0 ? saved.losses : 0
    };
  } catch {
    return { wins: 0, losses: 0 };
  }
}
const score = loadScore();

function renderScore() {
  winsCountElement.textContent = score.wins;
  lossesCountElement.textContent = score.losses;
}
function recordResult(won) {
  if (won) score.wins++;
  else score.losses++;
  try {
    localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(score));
  } catch {
    // Если хранилище недоступно, счётчики сохраняются до перезагрузки.
  }
  renderScore();
}

const russianAlphabet = Array.from("АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ");
const statusPriority = { unused: 0, missing: 1, present: 2, correct: 3 };
const hintElement = document.querySelector("#hint");
const boardElement = document.querySelector("#board");
const previewElement = document.querySelector("#wordPreview");
const alphabetElement = document.querySelector("#alphabet");
const currentAttemptElement = document.querySelector("#currentAttempt");
const attemptsLeftElement = document.querySelector("#attemptsLeft");
const guessForm = document.querySelector("#guessForm");
const submitButton = document.querySelector("#checkButton");
const finalForm = document.querySelector("#finalForm");
const finalInput = document.querySelector("#finalInput");
const finalSubmit = document.querySelector("#finalSubmit");
const finalEntry = document.querySelector("#finalEntry");
const messageElement = document.querySelector("#message");
const resultBackdrop = document.querySelector("#resultBackdrop");
const resultBanner = resultBackdrop.querySelector(".result-banner");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");
const nextWordButton = document.querySelector("#nextWordButton");
let guessInput = null;
let currentWord = "";
let currentAttempt = 0;
let usedLetters = {};
let revealed = [];
let phase = "guess";
let previousWord = "";

function startGame() {
  const available = GAME_WORDS.filter(item => item.word !== previousWord);
  const pool = available.length ? available : GAME_WORDS;
  const selected = pool[Math.floor(Math.random() * pool.length)];
  currentWord = selected.word.toLowerCase().trim();
  previousWord = currentWord;
  currentAttempt = 0;
  phase = "guess";
  revealed = Array(currentWord.length).fill(false);
  usedLetters = {};
  submitButton.disabled = false;
  guessForm.hidden = false;
  finalInput.value = "";
  finalInput.hidden = true;
  finalSubmit.hidden = true;
  finalForm.classList.remove("active");
  resultBackdrop.hidden = true;
  resultBanner.classList.remove("win", "lose");
  hintElement.textContent = selected.hint;
  messageElement.textContent = "Введи слово в первую строку.";
  renderBoard();
  renderPreview();
  renderAlphabet();
  updateStats();
}

function createLineInput(number) {
  const input = document.createElement("input");
  input.className = "line-input";
  input.type = "text";
  input.autocomplete = "off";
  input.autocapitalize = "none";
  input.spellcheck = false;
  input.maxLength = currentWord.length;
  input.setAttribute("aria-label", "Введите слово, попытка " + number);
  input.addEventListener("input", syncInput);
  return input;
}

function renderBoard() {
  boardElement.replaceChildren();
  boardElement.style.setProperty("--word-length", currentWord.length);
  for (let r = 0; r < maxAttempts; r++) {
    const row = document.createElement("div");
    row.className = "row" + (r === 0 ? " active" : "");
    row.style.setProperty("--word-length", currentWord.length);
    for (let c = 0; c < currentWord.length; c++) {
      const cell = document.createElement("span");
      cell.className = "cell";
      row.append(cell);
    }
    boardElement.append(row);
  }
  guessInput = createLineInput(1);
  boardElement.firstElementChild.append(guessInput);
  syncInput();
}

function syncInput() {
  if (!guessInput || phase !== "guess") return;
  const clean = guessInput.value.toLowerCase().replace(/[^а-яё]/g, "").slice(0, currentWord.length);
  if (guessInput.value !== clean) guessInput.value = clean;
  const row = boardElement.children[currentAttempt];
  if (!row) return;
  for (let i = 0; i < currentWord.length; i++) {
    const cell = row.children[i];
    cell.textContent = clean[i] ? clean[i].toUpperCase() : "";
    cell.classList.toggle("next", i === clean.length && clean.length < currentWord.length);
  }
}

function activateNextRow() {
  const row = boardElement.children[currentAttempt];
  if (!row) return;
  row.classList.add("active");
  guessInput = createLineInput(currentAttempt + 1);
  row.append(guessInput);
  syncInput();
}

function renderPreview() {
  previewElement.replaceChildren();
  previewElement.style.setProperty("--word-length", currentWord.length);
  const draft = finalInput.value.toLowerCase().replace(/[^а-яё]/g, "");
  let draftIndex = 0;
  for (let i = 0; i < currentWord.length; i++) {
    const cell = document.createElement("span");
    cell.className = "preview-cell";
    if (revealed[i]) {
      cell.classList.add("is-known");
      cell.textContent = currentWord[i].toUpperCase();
    } else if (phase === "final" && draft[draftIndex]) {
      cell.classList.add("is-draft");
      cell.textContent = draft[draftIndex].toUpperCase();
      draftIndex++;
    } else {
      cell.textContent = "?";
      if (phase === "final" && draftIndex === draft.length) {
        cell.classList.add("final-next");
        draftIndex++;
      }
    }
    previewElement.append(cell);
  }
}

function renderAlphabet() {
  alphabetElement.replaceChildren();
  for (const letter of russianAlphabet) {
    const cell = document.createElement("span");
    const status = usedLetters[letter] || "unused";
    cell.className = "alphabet-letter" + (status === "unused" ? "" : " " + status);
    cell.textContent = letter;
    cell.setAttribute("aria-label", letter + ": " + ({
      unused: "ещё не использована", missing: "отсутствует",
      present: "есть в слове", correct: "стоит на месте"
    })[status]);
    alphabetElement.append(cell);
  }
}

function updateStats() {
  currentAttemptElement.textContent = Math.min(currentAttempt + 1, maxAttempts);
  attemptsLeftElement.textContent = maxAttempts - currentAttempt;
}

function getGuessResult(guess) {
  const result = Array.from(guess, letter => ({ letter, status: "missing" }));
  const remaining = Array.from(currentWord);
  for (let i = 0; i < result.length; i++) {
    if (guess[i] === currentWord[i]) {
      result[i].status = "correct";
      remaining[i] = null;
    }
  }
  for (let i = 0; i < result.length; i++) {
    if (result[i].status === "correct") continue;
    const at = remaining.indexOf(guess[i]);
    if (at !== -1) {
      result[i].status = "present";
      remaining[at] = null;
    }
  }
  return result;
}

function updateAlphabet(result) {
  for (const item of result) {
    const letter = item.letter.toUpperCase();
    const previous = usedLetters[letter] || "unused";
    if (statusPriority[item.status] > statusPriority[previous]) {
      usedLetters[letter] = item.status;
    }
  }
  renderAlphabet();
}

function checkGuess(guess) {
  if (phase !== "guess") return;
  if (!guess) { messageElement.textContent = "Сначала введи слово."; return; }
  if (guess.length !== currentWord.length) {
    messageElement.textContent = "Нужно слово из " + currentWord.length + " букв.";
    return;
  }
  const result = getGuessResult(guess);
  const row = boardElement.children[currentAttempt];
  result.forEach((item, i) => {
    const cell = row.children[i];
    cell.textContent = item.letter.toUpperCase();
    cell.classList.remove("next");
    cell.classList.add(item.status);
    if (item.status === "correct") revealed[i] = true;
  });
  row.classList.remove("active");
  row.classList.add("completed");
  if (guessInput) {
    guessInput.remove();
    guessInput = null;
  }
  updateAlphabet(result);
  currentAttempt++;
  updateStats();
  renderPreview();
  if (guess === currentWord || revealed.every(Boolean)) {
    finishGame(true);
  } else if (currentAttempt >= maxAttempts) {
    beginFinalChance();
  } else {
    activateNextRow();
    messageElement.textContent = "Правильные буквы появились в верхней рамке.";
  }
}

function beginFinalChance() {
  phase = "final";
  guessForm.hidden = true;
  finalInput.hidden = false;
  finalSubmit.hidden = false;
  finalForm.classList.add("active");
  finalInput.maxLength = revealed.filter(value => !value).length;
  hintElement.textContent = "Подсказка: " + GAME_WORDS.find(item => item.word === currentWord).hint;
  messageElement.textContent = "Впиши недостающие буквы прямо в верхнюю рамку и проверь слово.";
  renderPreview();
}

function cleanFinalInput() {
  const clean = finalInput.value.toLowerCase().replace(/[^а-яё]/g, "").slice(0, finalInput.maxLength);
  if (finalInput.value !== clean) finalInput.value = clean;
  renderPreview();
}

function checkFinalChance() {
  if (phase !== "final") return;
  const missing = revealed.filter(value => !value).length;
  if (finalInput.value.length !== missing) {
    messageElement.textContent = "Впиши все " + missing + " недостающие буквы в верхней рамке.";
    return;
  }
  let index = 0;
  const candidate = Array.from(currentWord, (letter, i) =>
    revealed[i] ? letter : finalInput.value[index++]
  ).join("");
  if (candidate === currentWord) {
    revealed.fill(true);
    finalInput.hidden = true;
    finalSubmit.hidden = true;
    finalForm.classList.remove("active");
    renderPreview();
    finishGame(true);
  } else {
    finalInput.hidden = true;
    finalSubmit.hidden = true;
    finalForm.classList.remove("active");
    renderPreview();
    finishGame(false);
  }
}

function finishGame(won) {
  if (phase === "finished") return;
  recordResult(won);
  phase = "finished";
  guessForm.hidden = true;
  finalInput.hidden = true;
  finalSubmit.hidden = true;
  if (guessInput) { guessInput.remove(); guessInput = null; }
  finalForm.classList.remove("active");
  if (won) {
    revealed.fill(true);
    // Подсказка остаётся на экране после завершения раунда.
    resultTitle.textContent = "ПОЗДРАВЛЯЕМ!";
    resultText.textContent = "Ты угадал слово! Готов к следующему испытанию?";
    resultBanner.classList.add("win");
  } else {
    // Не раскрываем начальные буквы даже при поражении.
    resultTitle.textContent = "СЕГОДНЯ НЕ УГАДАЛИ";
    resultText.textContent = "В этот раз слово осталось загадкой. Попробуй ещё раз с новым словом!";
    resultBanner.classList.add("lose");
  }
  renderPreview();
  resultBackdrop.hidden = false;
  nextWordButton.focus();
}

guessForm.addEventListener("submit", event => {
  event.preventDefault();
  if (phase === "guess" && guessInput) checkGuess(guessInput.value.trim().toLowerCase());
});
finalForm.addEventListener("submit", event => {
  event.preventDefault();
  checkFinalChance();
});
finalInput.addEventListener("input", cleanFinalInput);
finalEntry.addEventListener("click", () => {
  if (phase === "final") finalInput.focus();
});
nextWordButton.addEventListener("click", startGame);
renderScore();
startGame();
if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
