const maxAttempts = 5;

const hintElement = document.querySelector("#hint");
const boardElement = document.querySelector("#board");
const currentAttemptElement = document.querySelector("#currentAttempt");
const attemptsLeftElement = document.querySelector("#attemptsLeft");
const guessForm = document.querySelector("#guessForm");
const guessInput = document.querySelector("#guessInput");
const messageElement = document.querySelector("#message");
const newGameButton = document.querySelector("#newGameButton");

let currentWord = "";
let currentHint = "";
let currentAttempt = 0;
let isGameOver = false;

function startGame() {
  const randomIndex = Math.floor(Math.random() * GAME_WORDS.length);
  const selectedWord = GAME_WORDS[randomIndex];

  currentWord = selectedWord.word.toLowerCase();
  currentHint = selectedWord.hint;
  currentAttempt = 0;
  isGameOver = false;

  hintElement.textContent = currentHint;
  messageElement.textContent = `Напиши слово из ${currentWord.length} букв.`;
  guessInput.value = "";
  guessInput.maxLength = currentWord.length;
  guessInput.disabled = false;
  guessForm.querySelector("button").disabled = false;

  renderBoard();
  updateStats();
  guessInput.focus();
}

function renderBoard() {
  boardElement.innerHTML = "";
  boardElement.style.setProperty("--word-length", currentWord.length);

  for (let rowIndex = 0; rowIndex < maxAttempts; rowIndex += 1) {
    const rowElement = document.createElement("div");
    rowElement.classList.add("row");

    for (let cellIndex = 0; cellIndex < currentWord.length; cellIndex += 1) {
      const cellElement = document.createElement("span");
      cellElement.classList.add("cell");
      rowElement.append(cellElement);
    }

    boardElement.append(rowElement);
  }
}

function updateStats() {
  currentAttemptElement.textContent = Math.min(currentAttempt + 1, maxAttempts);
  attemptsLeftElement.textContent = maxAttempts - currentAttempt;
}

function checkGuess(guess) {
  if (isGameOver) {
    return;
  }

  if (!guess) {
    messageElement.textContent = "Сначала введи букву или слово.";
    return;
  }

  if (guess.length !== currentWord.length) {
    messageElement.textContent = `Нужно слово из ${currentWord.length} букв.`;
    return;
  }

  showGuessResult(guess);
  currentAttempt += 1;
  updateStats();

  if (guess === currentWord) {
    finishGame("Победа! Все буквы на своих местах.");
    return;
  }

  if (currentAttempt >= maxAttempts) {
    finishGame(`Попытки закончились. Было слово: ${currentWord}.`);
    return;
  }

  messageElement.textContent = "Зеленые буквы стоят правильно, белые есть в слове, но не на этом месте.";
}

function showGuessResult(guess) {
  const rowElement = boardElement.children[currentAttempt];
  const result = getGuessResult(guess);

  result.forEach((letterData, index) => {
    const cellElement = rowElement.children[index];

    cellElement.textContent = letterData.status === "missing" ? "" : letterData.letter;
    cellElement.classList.add(letterData.status);
  });
}

function getGuessResult(guess) {
  const result = guess.split("").map((letter) => ({
    letter,
    status: "missing"
  }));

  const remainingLetters = currentWord.split("");

  for (let index = 0; index < guess.length; index += 1) {
    if (guess[index] === currentWord[index]) {
      result[index].status = "correct";
      remainingLetters[index] = null;
    }
  }

  for (let index = 0; index < guess.length; index += 1) {
    if (result[index].status === "correct") {
      continue;
    }

    const foundIndex = remainingLetters.indexOf(guess[index]);

    if (foundIndex !== -1) {
      result[index].status = "present";
      remainingLetters[foundIndex] = null;
    }
  }

  return result;
}

function finishGame(text) {
  isGameOver = true;
  messageElement.textContent = text;
  guessInput.disabled = true;
  guessForm.querySelector("button").disabled = true;
}

guessForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const guess = guessInput.value.trim().toLowerCase();
  checkGuess(guess);
  guessInput.value = "";
});

newGameButton.addEventListener("click", startGame);

startGame();

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
