const maxAttempts = 5;
const russianAlphabet = Array.from("АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ");
const statusPriority = { unused: 0, missing: 1, present: 2, correct: 3 };
const hintElement = document.querySelector("#hint");
const boardElement = document.querySelector("#board");
const previewElement = document.querySelector("#wordPreview");
const alphabetElement = document.querySelector("#alphabet");
const currentAttemptElement = document.querySelector("#currentAttempt");
const attemptsLeftElement = document.querySelector("#attemptsLeft");
const guessForm = document.querySelector("#guessForm");
const guessInput = document.querySelector("#guessInput");
const messageElement = document.querySelector("#message");
const newGameButton = document.querySelector("#newGameButton");
const submitButton = guessForm.querySelector("button");
let currentWord = "";
let currentAttempt = 0;
let isGameOver = false;
let usedLetters = {};

function startGame() {
  const selectedWord = GAME_WORDS[Math.floor(Math.random() * GAME_WORDS.length)];
  currentWord = selectedWord.word.toLowerCase().trim();
  currentAttempt = 0;
  isGameOver = false;
  usedLetters = {};
  guessInput.value = "";
  guessInput.maxLength = currentWord.length;
  guessInput.disabled = false;
  submitButton.disabled = false;
  hintElement.textContent = "Первая буква открыта";
  messageElement.textContent = "Попробуй угадать слово!";
  renderBoard();
  renderPreview(false);
  renderAlphabet();
  updateStats();
  // Не вызываем focus при запуске: на мобильном это открывает клавиатуру поверх игры.
}
function renderBoard() {
  boardElement.replaceChildren();
  boardElement.style.setProperty("--word-length", currentWord.length);
  for (let r = 0; r < maxAttempts; r++) {
    const row = document.createElement("div");
    row.className = "row";
    for (let c = 0; c < currentWord.length; c++) {
      const cell = document.createElement("span");
      cell.className = "cell";
      row.append(cell);
    }
    boardElement.append(row);
  }
}
function renderPreview(revealAll) {
  previewElement.replaceChildren();
  previewElement.style.setProperty("--word-length", currentWord.length);
  for (let i = 0; i < currentWord.length; i++) {
    const cell = document.createElement("span");
    cell.className = "preview-cell";
    if (revealAll || i === 0) {
      cell.classList.add("is-known");
      cell.textContent = currentWord[i].toUpperCase();
    } else {
      cell.textContent = "?";
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
  // Сначала отмечаем точные совпадения, затем учитываем оставшиеся повторы.
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
    // Если Л уже обнаружена, лишняя Л в другой попытке не перечеркнёт её.
    if (statusPriority[item.status] > statusPriority[previous]) {
      usedLetters[letter] = item.status;
    }
  }
  renderAlphabet();
}
function checkGuess(guess) {
  if (isGameOver) return;
  if (!guess) { messageElement.textContent = "Сначала введи слово."; return; }
  if (!/^[а-яё]+$/.test(guess)) {
    messageElement.textContent = "Используй русские буквы."; return;
  }
  if (guess.length !== currentWord.length) {
    messageElement.textContent = "Нужно слово из " + currentWord.length + " букв."; return;
  }
  const result = getGuessResult(guess);
  const row = boardElement.children[currentAttempt];
  result.forEach((item, i) => {
    const cell = row.children[i];
    cell.textContent = item.letter.toUpperCase(); // Не скрываем отсутствующие буквы.
    cell.classList.add(item.status);
  });
  updateAlphabet(result);
  currentAttempt++;
  updateStats();
  if (guess === currentWord) { finishGame("Победа! Все буквы на своих местах."); return; }
  if (currentAttempt >= maxAttempts) {
    finishGame("Попытки закончились. Было слово: " + currentWord.toUpperCase() + "."); return;
  }
  messageElement.textContent = "Зелёные — на месте, золотые — есть в слове. Зачёркнутых букв нет в слове.";
}
function finishGame(text) {
  isGameOver = true;
  messageElement.textContent = text;
  guessInput.disabled = true;
  submitButton.disabled = true;
  renderPreview(true);
  hintElement.textContent = "Слово раскрыто";
}
guessForm.addEventListener("submit", event => {
  event.preventDefault();
  const guess = guessInput.value.trim().toLowerCase();
  checkGuess(guess);
  if (guess.length === currentWord.length && /^[а-яё]+$/.test(guess)) guessInput.value = "";
});
newGameButton.addEventListener("click", startGame);
startGame();
if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
