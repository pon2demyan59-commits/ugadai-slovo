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

// Отдельный от статистики список уже показанных и разгаданных слов.
const WORD_PROGRESS_KEY = "ugadai-slovo-word-progress-v1";
const wordBank = [...new Set(GAME_WORDS.map(item => item.word.toLowerCase().trim()))];
function loadWordProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(WORD_PROGRESS_KEY) || "{}");
    const valid = new Set(wordBank);
    return {
      attempted: new Set(Array.isArray(saved.attempted) ? saved.attempted.filter(w => valid.has(w)) : []),
      solved: new Set(Array.isArray(saved.solved) ? saved.solved.filter(w => valid.has(w)) : []),
      active: valid.has(saved.active) ? saved.active : null
    };
  } catch {
    return { attempted: new Set(), solved: new Set(), active: null };
  }
}
const wordProgress = loadWordProgress();
for (const word of wordProgress.solved) wordProgress.attempted.add(word);
function saveWordProgress() {
  try {
    localStorage.setItem(WORD_PROGRESS_KEY, JSON.stringify({
      attempted: [...wordProgress.attempted],
      solved: [...wordProgress.solved],
      active: wordProgress.active
    }));
  } catch { /* Прогресс останется доступен до обновления страницы. */ }
}
function chooseNextWord() {
  const fresh = wordBank.filter(word => !wordProgress.attempted.has(word));
  const unfinished = wordBank.filter(word => !wordProgress.solved.has(word));
  const pool = fresh.length ? fresh : unfinished;
  if (!pool.length) return null;
  const alternatives = pool.filter(word => word !== previousWord);
  const choices = alternatives.length ? alternatives : pool;
  return choices[Math.floor(Math.random() * choices.length)];
}
function showCollectionComplete() {
  phase = "finished";
  guessForm.hidden = true;
  finalInput.hidden = true;
  resultBanner.classList.remove("lose");
  resultBanner.classList.add("win");
  resultTitle.textContent = "ВСЕ СЛОВА РАЗГАДАНЫ!";
  resultText.textContent = "Ты разгадал все " + wordBank.length + " слов. Можешь начать новый круг!";
  nextWordButton.textContent = "Начать заново";
  resultBackdrop.hidden = false;
  nextWordButton.focus();
}

// Экранная русская клавиатура — единственный способ вводить буквы на телефоне.
const keyboardRows = ["ЙЦУКЕНГШЩЗХЪ", "ФЫВАПРОЛДЖЭ", "ЯЧСМИТЬБЮ"];
const statusPriority = { unused: 0, missing: 1, present: 2, correct: 3 };
const hintElement = document.querySelector("#hint");
const boardElement = document.querySelector("#board");
const previewElement = document.querySelector("#wordPreview");
const alphabetElement = document.querySelector("#alphabet");
const currentAttemptElement = document.querySelector("#currentAttempt");
const attemptsLeftElement = document.querySelector("#attemptsLeft");
const guessForm = document.querySelector("#guessForm");
const finalForm = document.querySelector("#finalForm");
const finalInput = document.querySelector("#finalInput");
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
  // Незаконченное слово остаётся текущим после обновления страницы.
  const nextWord = wordProgress.active && !wordProgress.solved.has(wordProgress.active)
    ? wordProgress.active : chooseNextWord();
  if (!nextWord) {
    showCollectionComplete();
    return;
  }
  const selected = GAME_WORDS.find(item => item.word.toLowerCase().trim() === nextWord);
  currentWord = nextWord;
  previousWord = currentWord;
  wordProgress.active = currentWord;
  wordProgress.attempted.add(currentWord);
  saveWordProgress();
  currentAttempt = 0;
  phase = "guess";
  revealed = Array(currentWord.length).fill(false);
  usedLetters = {};
  guessForm.hidden = false;
  finalInput.value = "";
  finalInput.hidden = true;
  finalForm.classList.remove("active");
  messageElement.classList.remove("is-error");
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
  input.inputMode = "text";
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

// Экранная клавиатура: буквы также можно нажимать мышкой или пальцем.
// Обе клавиатуры редактируют одно и то же поле: у телефона и игровой клавиатуры
// общий текст и позиция курсора, поэтому удаление работает в обе стороны.
function activeLetterInput() {
  return phase === "final" ? finalInput : phase === "guess" ? guessInput : null;
}

function typeKeyboardLetter(letter) {
  const target = activeLetterInput();
  if (!target) return;
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? start;
  if (target.value.length - (end - start) >= target.maxLength) return;
  target.setRangeText(letter.toLowerCase(), start, end, "end");
  target.dispatchEvent(new Event("input", { bubbles: true }));
  messageElement.classList.remove("is-error");
}

function eraseKeyboardLetter() {
  const target = activeLetterInput();
  if (!target || !target.value.length) return;
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? start;
  if (start === end && start === 0) return;
  target.setRangeText("", start === end ? start - 1 : start, end, "end");
  target.dispatchEvent(new Event("input", { bubbles: true }));
  messageElement.classList.remove("is-error");
}

function showInputError(text) {
  messageElement.textContent = text;
  messageElement.classList.add("is-error");
}

// Одна клавиша Е/Ё: при нажатии показываем выбор нужной буквы.
function showEChoice(anchor) {
  const old = alphabetElement.querySelector(".keyboard-letter-choice");
  if (old) { const sameKey = old.parentElement === anchor; old.remove(); if (sameKey) return; }
  const menu = document.createElement("div");
  menu.className = "keyboard-letter-choice";
  menu.setAttribute("role", "group");
  menu.setAttribute("aria-label", "Выбрать Е или Ё");
  for (const letter of ["Е", "Ё"]) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "keyboard-choice-button";
    option.textContent = letter;
    option.addEventListener("click", event => {
      event.stopPropagation();
      menu.remove();
      typeKeyboardLetter(letter);
    });
    menu.append(option);
  }
  anchor.append(menu);
}
function renderAlphabet() {
  alphabetElement.replaceChildren();
  for (const letters of keyboardRows) {
    const row = document.createElement("div");
    row.className = "keyboard-row";
    for (const letter of letters) {
      const combined = letter === "Е";
      const cellWrap = document.createElement("div");
      cellWrap.className = "keyboard-key-wrap";
      const cell = document.createElement("button");
      cell.type = "button";
      const status = combined
        ? (statusPriority[usedLetters["Е"] || "unused"] >= statusPriority[usedLetters["Ё"] || "unused"]
            ? usedLetters["Е"] || "unused" : usedLetters["Ё"] || "unused")
        : usedLetters[letter] || "unused";
      cell.className = "alphabet-letter" + (status === "unused" ? "" : " " + status);
      cell.textContent = combined ? "Е/Ё" : letter;
      cell.setAttribute("aria-label", (combined ? "Выбрать Е или Ё" : letter) + ": " + ({
        unused: "ещё не использована", missing: "отсутствует",
        present: "есть в слове", correct: "стоит на месте"
      })[status]);
      cell.addEventListener("click", () => combined ? showEChoice(cellWrap) : typeKeyboardLetter(letter));
      cellWrap.append(cell);
      row.append(cellWrap);
    }
    alphabetElement.append(row);
  }
  // Две удобные кнопки под буквами: удалить и проверить слово.
  const actions = document.createElement("div");
  actions.className = "keyboard-row keyboard-actions";
  const erase = document.createElement("button");
  erase.type = "button";
  erase.className = "keyboard-erase";
  erase.textContent = "⌫ Удалить";
  erase.setAttribute("aria-label", "Удалить последнюю букву");
  erase.addEventListener("click", eraseKeyboardLetter);
  actions.append(erase);

  const enter = document.createElement("button");
  enter.type = "button";
  enter.className = "keyboard-enter";
  enter.textContent = "Проверить";
  enter.setAttribute("aria-label", "Проверить слово");
  enter.addEventListener("click", () => {
    if (phase === "guess" && guessInput) checkGuess(guessInput.value.trim().toLowerCase());
    else if (phase === "final") checkFinalChance();
  });
  actions.append(enter);
  alphabetElement.append(actions);
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
  if (!guess) { showInputError("Сначала введи слово."); return; }
  if (guess.length !== currentWord.length) {
    showInputError("Нужно слово из " + currentWord.length + " букв.");
    return;
  }
  // Ошибочная последовательность букв не расходует попытку.
  if (!VALID_RUSSIAN_WORDS.has(guess)) {
    showInputError("Такого слова нет в словаре. Попробуй другое.");
    return;
  }
  messageElement.classList.remove("is-error");
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
    showInputError("Впиши все " + missing + " недостающие буквы.");
    return;
  }
  let index = 0;
  const candidate = Array.from(currentWord, (letter, i) =>
    revealed[i] ? letter : finalInput.value[index++]
  ).join("");
  if (candidate === currentWord) {
    revealed.fill(true);
    finalInput.hidden = true;
    finalForm.classList.remove("active");
    renderPreview();
    finishGame(true);
  } else {
    finalInput.hidden = true;
    finalForm.classList.remove("active");
    renderPreview();
    finishGame(false);
  }
}

function finishGame(won) {
  if (phase === "finished") return;
  recordResult(won);
  if (won) wordProgress.solved.add(currentWord);
  wordProgress.active = null;
  saveWordProgress();
  phase = "finished";
  guessForm.hidden = true;
  finalInput.hidden = true;
  if (guessInput) { guessInput.remove(); guessInput = null; }
  finalForm.classList.remove("active");
  if (won) {
    revealed.fill(true);
    // Подсказка остаётся на экране после завершения раунда.
    resultTitle.textContent = "ПОЗДРАВЛЯЕМ!";
    const remaining = wordBank.length - wordProgress.solved.size;
    resultText.textContent = remaining
      ? "Ты угадал слово! Осталось разгадать: " + remaining + "."
      : "Ты разгадал все " + wordBank.length + " слов! Поздравляем!";
    nextWordButton.textContent = remaining ? "Следующее слово" : "Начать заново";
    resultBanner.classList.add("win");
  } else {
    // Не раскрываем начальные буквы даже при поражении.
    resultTitle.textContent = "СЕГОДНЯ НЕ УГАДАЛИ";
    resultText.textContent = "В этот раз слово осталось загадкой. Сначала будут новые слова, затем вернёмся к неразгаданным.";
    nextWordButton.textContent = "Следующее слово";
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
nextWordButton.addEventListener("click", () => {
  if (wordProgress.solved.size === wordBank.length) {
    wordProgress.solved.clear();
    wordProgress.attempted.clear();
    wordProgress.active = null;
    previousWord = "";
    saveWordProgress();
  }
  startGame();
});
// Навигация внутри страницы: заставка -> меню -> игра.
// Возврат в меню не сбрасывает текущий раунд и статистику.
const welcomeScreen = document.querySelector("#welcomeScreen");
const homeScreen = document.querySelector("#homeScreen");
const gameScreen = document.querySelector("#gameScreen");
const details = document.querySelector("#menuDetails");
const detailsTitle = document.querySelector("#menuDetailsTitle");
const detailsBody = document.querySelector("#menuDetailsBody");
const homeMenu = document.querySelector(".home-menu");
function showScreen(screen) {
  welcomeScreen.hidden = screen !== welcomeScreen;
  homeScreen.hidden = screen !== homeScreen;
  gameScreen.hidden = screen !== gameScreen;
  if (screen === homeScreen) {
    closeMenuDetails();
    document.querySelector("#menuPlay").focus({ preventScroll:true });
  }
}
function closeMenuDetails() {
  details.hidden = true;
  homeMenu.hidden = false;
}
function openMenuDetails(title) {
  detailsTitle.textContent = title;
  details.hidden = false;
  homeMenu.hidden = true;
  detailsBody.replaceChildren();
}
document.querySelector("#welcomeEnter").addEventListener("click", () => showScreen(homeScreen));
document.querySelector("#menuPlay").addEventListener("click", () => showScreen(gameScreen));
document.querySelector("#gameMenuBack").addEventListener("click", () => showScreen(homeScreen));
document.querySelector("#menuSplashBack").addEventListener("click", () => showScreen(welcomeScreen));
document.querySelector("#menuDetailsBack").addEventListener("click", closeMenuDetails);
document.querySelector("#menuStats").addEventListener("click", () => {
  openMenuDetails("СТАТИСТИКА");
  const lines = [
    ["Угадано", score.wins],
    ["Не угадано", score.losses],
    ["Разгадано разных слов", wordProgress.solved.size + " / " + wordBank.length]
  ];
  for (const [label, value] of lines) {
    const line = document.createElement("div");
    line.className = "home-stat-line";
    const name = document.createElement("span");
    name.textContent = label;
    const number = document.createElement("strong");
    number.textContent = value;
    line.append(name, number);
    detailsBody.append(line);
  }
});
document.querySelector("#menuRules").addEventListener("click", () => {
  openMenuDetails("КАК ИГРАТЬ");
  const rules = [
    "Угадай слово из 5 букв за 4 попытки.",
    "Зелёная буква — на своём месте, жёлтая — есть в слове, серая — отсутствует.",
    "Вводи настоящие слова с игровой клавиатуры или клавиатуры телефона.",
    "После четырёх попыток получишь последний шанс вписать недостающие буквы."
  ];
  const list = document.createElement("ol");
  for (const rule of rules) {
    const item = document.createElement("li");
    item.textContent = rule;
    list.append(item);
  }
  detailsBody.append(list);
});
renderScore();
startGame();
if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
