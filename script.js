const words = [
  {
    word: "молния",
    hint: "Яркая вспышка во время грозы."
  },
  {
    word: "замок",
    hint: "Может быть крепостью или стоять на двери."
  },
  {
    word: "фонарь",
    hint: "Помогает видеть в темноте."
  },
  {
    word: "корабль",
    hint: "Плывет по морю и перевозит людей или груз."
  },
  {
    word: "легенда",
    hint: "Старая история, в которой правда смешана с вымыслом."
  }
];

const maxMistakes = 6;

const hintElement = document.querySelector("#hint");
const wordElement = document.querySelector("#word");
const mistakesElement = document.querySelector("#mistakes");
const attemptsElement = document.querySelector("#attempts");
const guessForm = document.querySelector("#guessForm");
const guessInput = document.querySelector("#guessInput");
const messageElement = document.querySelector("#message");
const usedLettersElement = document.querySelector("#usedLetters");
const newGameButton = document.querySelector("#newGameButton");

let currentWord = "";
let currentHint = "";
let openedLetters = [];
let usedLetters = [];
let mistakes = 0;
let isGameOver = false;

function startGame() {
  const randomIndex = Math.floor(Math.random() * words.length);
  const selectedWord = words[randomIndex];

  currentWord = selectedWord.word.toLowerCase();
  currentHint = selectedWord.hint;
  openedLetters = [];
  usedLetters = [];
  mistakes = 0;
  isGameOver = false;

  hintElement.textContent = currentHint;
  messageElement.textContent = "Введи букву или попробуй угадать слово целиком.";
  guessInput.value = "";
  guessInput.disabled = false;
  guessForm.querySelector("button").disabled = false;

  renderGame();
  guessInput.focus();
}

function renderGame() {
  wordElement.innerHTML = "";

  for (const letter of currentWord) {
    const letterElement = document.createElement("span");
    letterElement.classList.add("letter");
    letterElement.textContent = openedLetters.includes(letter) ? letter : "";
    wordElement.append(letterElement);
  }

  mistakesElement.textContent = mistakes;
  attemptsElement.textContent = maxMistakes - mistakes;
  usedLettersElement.textContent = usedLetters.length > 0 ? usedLetters.join(", ") : "пока нет";
}

function checkGuess(guess) {
  if (isGameOver) {
    return;
  }

  if (!guess) {
    messageElement.textContent = "Сначала введи букву или слово.";
    return;
  }

  if (guess.length === 1) {
    checkLetter(guess);
  } else {
    checkWord(guess);
  }

  renderGame();
  checkGameEnd();
}

function checkLetter(letter) {
  if (usedLetters.includes(letter)) {
    messageElement.textContent = "Эта буква уже была.";
    return;
  }

  usedLetters.push(letter);

  if (currentWord.includes(letter)) {
    openedLetters.push(letter);
    messageElement.textContent = "Есть такая буква.";
  } else {
    mistakes += 1;
    messageElement.textContent = "Такой буквы нет.";
  }
}

function checkWord(word) {
  if (word === currentWord) {
    openedLetters = [...new Set(currentWord.split(""))];
    messageElement.textContent = "Верно! Ты угадал слово целиком.";
  } else {
    mistakes += 1;
    messageElement.textContent = "Не угадал. Минус одна попытка.";
  }
}

function checkGameEnd() {
  const isWordOpened = currentWord
    .split("")
    .every((letter) => openedLetters.includes(letter));

  if (isWordOpened) {
    finishGame("Победа! Слово открыто.");
  }

  if (mistakes >= maxMistakes) {
    finishGame(`Попытки закончились. Было слово: ${currentWord}.`);
  }
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
