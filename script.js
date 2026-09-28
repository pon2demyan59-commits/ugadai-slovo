const maxAttempts = 4;
const SCORE_STORAGE_KEY = "ugadai-slovo-score-v1";

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

function recordResult(won) {
  if (won) score.wins++;
  else score.losses++;
  try {
    localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(score));
  } catch {
    // Если хранилище недоступно, счётчики сохраняются до перезагрузки.
  }
}

// Прогресс отдельно для каждой пары «категория + уровень».
const WORD_PROGRESS_KEY = "ugadai-slovo-category-level-progress-v3";
const OLD_PROGRESS_KEY = "ugadai-slovo-category-progress-v2";
const UI_STORAGE_KEY = "ugadai-slovo-ui-v1";
const MAX_LEVEL = 5;
const LEVEL_NAMES = ["Новичок","Любитель","Знаток","Эксперт","Мастер слов"];
const categoryIds = new Set(GAME_CATEGORIES.map(c => c.id));
const wordsInCategory = (id,level=1) =>
  GAME_WORDS.filter(w => w.category === id && (w.level || 1) === level).map(w => w.word);
const getEntry = (id,level,word) =>
  GAME_WORDS.find(w => w.category === id && w.level === level && w.word === word);
const acceptedAnswers = new Set(GAME_WORDS.map(w => w.word));
function loadAllProgress() {
  let saved = null,legacy = {};
  try {saved = JSON.parse(localStorage.getItem(WORD_PROGRESS_KEY) || "null");} catch {}
  if (!saved) {
    try {legacy = JSON.parse(localStorage.getItem(OLD_PROGRESS_KEY) || "{}");} catch {}
  }
  const result = {};
  for (const c of GAME_CATEGORIES) {
    result[c.id] = {};
    for (let lvl=1;lvl<=MAX_LEVEL;lvl++) {
      const old = lvl===1 ? legacy[c.id] : null;
      const entry = saved?.[c.id]?.[lvl] || old || {};
      const valid = new Set(wordsInCategory(c.id,lvl));
      const solved = new Set(Array.isArray(entry.solved) ? entry.solved.filter(w => valid.has(w)) : []);
      const attempted = new Set(Array.isArray(entry.attempted) ? entry.attempted.filter(w => valid.has(w)) : []);
      solved.forEach(w => attempted.add(w));
      const active = valid.has(entry.active) && !solved.has(entry.active) ? entry.active : null;
      const roundData = entry.round || {};
      const round = active && roundData.word === active ? {
        word:active,
        guesses:Array.isArray(roundData.guesses)
          ? roundData.guesses.filter(g=>typeof g==="string" && g.length===active.length &&
            /^[а-яё]+$/.test(g) && g!==active).slice(0,maxAttempts) : [],
        draft:typeof roundData.draft==="string" ? roundData.draft : "",
        finalDraft:typeof roundData.finalDraft==="string" ? roundData.finalDraft : ""
      } : null;
      result[c.id][lvl] = {solved,attempted,active,round,
        completed:!!entry.completed || solved.size===valid.size && valid.size>0};
    }
  }
  return result;
}
function loadUiState() {
  try {
    const s=JSON.parse(localStorage.getItem(UI_STORAGE_KEY)||"{}");
    return {
      category:categoryIds.has(s.category) ? s.category : GAME_CATEGORIES[0].id,
      level:Number.isInteger(s.level)&&s.level>=1&&s.level<=MAX_LEVEL ? s.level : 1,
      screen:["welcome","home","game"].includes(s.screen) ? s.screen : "welcome",
      homeView:["menu","categories","levels","stats","rules"].includes(s.homeView) ? s.homeView : "menu"
    };
  } catch {
    return {category:GAME_CATEGORIES[0].id,level:1,screen:"welcome",homeView:"menu"};
  }
}
const allProgress = loadAllProgress();
const initialUiState = loadUiState();
let selectedCategory = initialUiState.category;
let selectedLevel = initialUiState.level;
const levelUnlocked = (id,level) =>
  level===1 || allProgress[id][level-1].completed ||
  allProgress[id][level-1].solved.size===wordsInCategory(id,level-1).length;
if (!levelUnlocked(selectedCategory,selectedLevel)) selectedLevel=1;
let wordProgress = allProgress[selectedCategory][selectedLevel];
let wordBank = wordsInCategory(selectedCategory,selectedLevel);
let roundGuesses = [];
let restoringRound = false;
function saveWordProgress() {
  try {
    const data = {};
    for (const c of GAME_CATEGORIES) {
      data[c.id] = {};
      for (let l=1;l<=MAX_LEVEL;l++) {
        const entry=allProgress[c.id][l];
        data[c.id][l]={solved:[...entry.solved],attempted:[...entry.attempted],
          active:entry.active,round:entry.round,completed:entry.completed};
      }
    }
    localStorage.setItem(WORD_PROGRESS_KEY,JSON.stringify(data));
  } catch { /* При отключённом хранилище прогресс живёт до закрытия игры. */ }
}
function saveRound() {
  if (restoringRound || !wordProgress.active || phase==="finished") return;
  wordProgress.round={word:currentWord,guesses:[...roundGuesses],
    draft:phase==="guess" && guessInput ? guessInput.value : "",
    finalDraft:phase==="final" ? finalInput.value : ""};
  saveWordProgress();
}
function chooseNextWord() {
  const fresh=wordBank.filter(w=>!wordProgress.attempted.has(w));
  const unsolved=wordBank.filter(w=>!wordProgress.solved.has(w));
  const pool=fresh.length?fresh:unsolved;
  if (!pool.length) return null;
  const alternatives=pool.filter(w=>w!==previousWord);
  const choices=alternatives.length?alternatives:pool;
  return choices[Math.floor(Math.random()*choices.length)];
}
function showCollectionComplete() {
  phase="finished";
  guessForm.hidden=true;
  finalInput.hidden=true;
  resultBanner.classList.remove("lose");
  resultBanner.classList.add("win");
  wordProgress.completed=true;
  saveWordProgress();
  resultTitle.textContent="УРОВЕНЬ "+selectedLevel+" ПРОЙДЕН!";
  resultText.textContent="Все 20 заданий категории разгаданы!"+(selectedLevel<MAX_LEVEL?" Следующий уровень открыт.":" Категория полностью пройдена!");
  nextWordButton.textContent="К уровням";
  resultBackdrop.hidden=false;
}

// Русская игровая клавиатура// Русская игровая клавиатура дополняет системную клавиатуру телефона.
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

let currentEntry=null;
let phraseBreaks=[];
function startGame() {
  const nextWord=wordProgress.active && !wordProgress.solved.has(wordProgress.active)
    ? wordProgress.active : chooseNextWord();
  if (!nextWord) {showCollectionComplete();return;}
  const selected=getEntry(selectedCategory,selectedLevel,nextWord);
  if (!selected) return;
  currentEntry=selected;
  currentWord=nextWord;
  previousWord=nextWord;
  wordProgress.active=currentWord;
  wordProgress.attempted.add(currentWord);
  const parts=(selected.display || selected.word).split(/\s+/).map(s=>s.length);
  phraseBreaks=[];
  let offset=0;
  for (let i=0;i<parts.length-1;i++) {offset+=parts[i];phraseBreaks.push(offset);}
  const resume=wordProgress.round && wordProgress.round.word===nextWord ? wordProgress.round : null;
  currentAttempt=0;
  phase="guess";
  revealed=Array(currentWord.length).fill(false);
  usedLetters={};
  roundGuesses=[];
  restoringRound=true;
  guessForm.hidden=false;
  finalInput.value="";
  finalInput.hidden=true;
  finalForm.classList.remove("active");
  messageElement.classList.remove("is-error");
  resultBackdrop.hidden=true;
  resultBanner.classList.remove("win","lose");
  hintElement.textContent=selected.hint;
  const cat=GAME_CATEGORIES.find(c=>c.id===selectedCategory);
  document.querySelector("#activeCategoryTitle").textContent=cat.icon+" "+cat.title+" · Уровень "+selectedLevel;
  messageElement.textContent="Угадай слово!";
  renderBoard();
  renderPreview();
  renderAlphabet();
  updateStats();
  if (resume) {
    for (const guess of resume.guesses) {
      if (phase!=="guess") break;
      checkGuess(guess);
    }
    if (phase==="guess" && guessInput) {
      guessInput.value=resume.draft||"";
      syncInput();
    } else if (phase==="final") {
      finalInput.value=resume.finalDraft||"";
      cleanFinalInput();
    }
  }
  restoringRound=false;
  saveRound();
  saveWordProgress();
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
  input.addEventListener("input", () => {syncInput();saveRound();});
  return input;
}

function renderBoard() {
  boardElement.replaceChildren();
  const long=currentWord.length>8;
  const columns=Math.min(currentWord.length,8);
  boardElement.classList.toggle("long-letters",long);
  boardElement.style.setProperty("--word-length",currentWord.length);
  boardElement.style.setProperty("--columns",columns);
  document.querySelector(".word-panel").classList.toggle("long-puzzle",long);
  for (let r=0;r<maxAttempts;r++) {
    const row=document.createElement("div");
    row.className="row"+(r===0?" active":"");
    row.style.setProperty("--word-length",currentWord.length);
    row.style.setProperty("--columns",columns);
    for (let i=0;i<currentWord.length;i++) {
      const cell=document.createElement("span");
      cell.className="cell";
      if (phraseBreaks.includes(i)) cell.classList.add("word-new-part");
      row.append(cell);
    }
    boardElement.append(row);
  }
  guessInput=createLineInput(1);
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
  previewElement.style.setProperty("--word-length",currentWord.length);
  previewElement.style.setProperty("--columns",Math.min(currentWord.length,8));
  previewElement.classList.toggle("long-letters",currentWord.length>8);
  const draft=finalInput.value.toLowerCase().replace(/[^а-яё]/g,"");
  let draftIndex=0;
  for (let i=0;i<currentWord.length;i++) {
    const cell=document.createElement("span");
    cell.className="preview-cell";
    if (phraseBreaks.includes(i)) cell.classList.add("word-new-part");
    if (revealed[i]) {
      cell.classList.add("is-known");
      cell.textContent=currentWord[i].toUpperCase();
    } else if (phase==="final" && draft[draftIndex]) {
      cell.classList.add("is-draft");
      cell.textContent=draft[draftIndex++].toUpperCase();
    } else {
      cell.textContent="?";
      if (phase==="final" && draftIndex===draft.length) {
        cell.classList.add("final-next");
        draftIndex++;
      }
    }
    previewElement.append(cell);
  }
}

// Экранная клавиатура:// Экранная клавиатура: буквы также можно нажимать мышкой или пальцем.
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
  // На пятом уровне составные выражения проверяются по буквам и длине,
  // обычные слова — по лицензированному словарю существительных.
  const phrase=currentEntry?.display?.includes(" ");
  const known=VALID_RUSSIAN_WORDS.has(guess)||VALID_LONG_WORDS.has(guess)||
    EXTRA_VALID_WORDS.has(guess)||acceptedAnswers.has(guess);
  if (!phrase && !known) {
    showInputError("Такого слова нет в словаре. Попробуй другое.");
    return;
  }
  messageElement.classList.remove("is-error");
  const result = getGuessResult(guess);
  roundGuesses.push(guess);
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
  saveRound();
}

function beginFinalChance() {
  phase = "final";
  guessForm.hidden = true;
  finalInput.hidden = false;
  finalForm.classList.add("active");
  finalInput.maxLength = revealed.filter(value => !value).length;
  hintElement.textContent = "Подсказка: " + currentEntry.hint;
  messageElement.textContent = "Впиши недостающие буквы прямо в верхнюю рамку и проверь слово.";
  renderPreview();
}

function cleanFinalInput() {
  const clean = finalInput.value.toLowerCase().replace(/[^а-яё]/g, "").slice(0, finalInput.maxLength);
  if (finalInput.value !== clean) finalInput.value = clean;
  renderPreview();
  saveRound();
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
  if (phase==="finished") return;
  recordResult(won);
  if (won) wordProgress.solved.add(currentWord);
  const complete=wordProgress.solved.size===wordBank.length;
  if (complete) wordProgress.completed=true;
  wordProgress.active=null;
  wordProgress.round=null;
  saveWordProgress();
  phase="finished";
  guessForm.hidden=true;
  finalInput.hidden=true;
  if (guessInput) {guessInput.remove();guessInput=null;}
  finalForm.classList.remove("active");
  if (won) {
    revealed.fill(true);
    resultTitle.textContent=complete?"УРОВЕНЬ "+selectedLevel+" ПРОЙДЕН!":"ПОЗДРАВЛЯЕМ!";
    resultText.textContent=complete
      ? "Все 20 слов разгаданы!"+(selectedLevel<MAX_LEVEL?" Следующий уровень открыт.":" Все пять уровней категории завершены!")
      : "Ты угадал слово! Осталось разгадать: "+(wordBank.length-wordProgress.solved.size)+".";
    nextWordButton.textContent=complete?"К уровням":"Следующее слово";
    resultBanner.classList.add("win");
  } else {
    resultTitle.textContent="ПОКА НЕ УГАДАНО";
    resultText.textContent="Это слово осталось загадкой. Следующим будет новое, а затем вернёмся к неразгаданным.";
    nextWordButton.textContent="Следующее слово";
    resultBanner.classList.add("lose");
  }
  renderPreview();
  resultBackdrop.hidden=false;
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
nextWordButton.addEventListener("click",()=>{
  if (wordProgress.completed && wordProgress.solved.size===wordBank.length) {
    resultBackdrop.hidden=true;
    showScreen(homeScreen);
    showLevels(selectedCategory);
  } else {
    startGame();
  }
});
// Сохраняем открытый раздел меню, категорию, уровень и незаконченный раунд.
const welcomeScreen=document.querySelector("#welcomeScreen");
const homeScreen=document.querySelector("#homeScreen");
const gameScreen=document.querySelector("#gameScreen");
const homeCard=document.querySelector(".home-card");
const homeMenu=document.querySelector(".home-menu");
const categoryScreen=document.querySelector("#categoryScreen");
const categoryList=document.querySelector("#categoryList");
const levelsScreen=document.querySelector("#levelsScreen");
const levelsList=document.querySelector("#levelsList");
const details=document.querySelector("#menuDetails");
const detailsTitle=document.querySelector("#menuDetailsTitle");
const detailsBody=document.querySelector("#menuDetailsBody");
let homeView="menu";
function saveUiState() {
  try {
    localStorage.setItem(UI_STORAGE_KEY,JSON.stringify({
      category:selectedCategory,level:selectedLevel,
      screen:gameScreen.hidden?(homeScreen.hidden?"welcome":"home"):"game",
      homeView
    }));
  } catch {}
}
function setHomeView(view) {
  homeView=view;
  homeMenu.hidden=view!=="menu";
  categoryScreen.hidden=view!=="categories";
  levelsScreen.hidden=view!=="levels";
  details.hidden=view!=="stats" && view!=="rules";
  homeCard.classList.toggle("subview",view!=="menu");
  homeCard.setAttribute("aria-labelledby",{
    menu:"homeTitle",categories:"categoryTitle",levels:"levelsTitle",
    stats:"menuDetailsTitle",rules:"menuDetailsTitle"
  }[view]);
  saveUiState();
}
function showScreen(screen) {
  welcomeScreen.hidden=screen!==welcomeScreen;
  homeScreen.hidden=screen!==homeScreen;
  gameScreen.hidden=screen!==gameScreen;
  if (screen===homeScreen) setHomeView("menu");
  saveUiState();
}
function openMenuDetails(title,view) {
  detailsTitle.textContent=title;
  detailsBody.replaceChildren();
  setHomeView(view);
}
function showCategories() {
  setHomeView("categories");
  categoryList.replaceChildren();
  GAME_CATEGORIES.forEach((cat,index)=>{
    const button=document.createElement("button");
    button.type="button";
    button.className="category-item category-item-"+index;
    const icon=document.createElement("span");
    icon.className="category-icon";
    icon.textContent=cat.icon;
    const info=document.createElement("span");
    info.className="category-info";
    const title=document.createElement("strong");
    title.textContent=cat.title;
    const subtitle=document.createElement("small");
    subtitle.textContent=cat.description;
    const completed=Array.from({length:MAX_LEVEL},(_,i)=>i+1).filter(l=>allProgress[cat.id][l].completed).length;
    const level=document.createElement("span");
    level.className="category-level";
    level.textContent=completed===MAX_LEVEL?"Все уровни пройдены":completed+" из "+MAX_LEVEL+" уровней";
    const total=Array.from({length:MAX_LEVEL},(_,i)=>i+1)
      .reduce((sum,l)=>sum+allProgress[cat.id][l].solved.size,0);
    const future=document.createElement("small");
    future.className="category-total";
    future.textContent="20 заданий на каждом уровне";
    info.append(title,subtitle,level,future);
    const count=document.createElement("span");
    count.className="category-count";
    count.textContent=total+"/100";
    button.append(icon,info,count);
    button.addEventListener("click",()=>showLevels(cat.id));
    categoryList.append(button);
  });
}
function showLevels(id) {
  saveRound();
  selectedCategory=id;
  const cat=GAME_CATEGORIES.find(c=>c.id===id);
  document.querySelector("#levelsTitle").textContent=cat.icon+" "+cat.title;
  document.querySelector("#levelsSubtitle").textContent="Пять уровней · 100 заданий";
  levelsList.replaceChildren();
  for (let level=1;level<=MAX_LEVEL;level++) {
    const unlocked=levelUnlocked(id,level);
    const progress=allProgress[id][level];
    const button=document.createElement("button");
    button.type="button";
    button.className="level-card";
    button.disabled=!unlocked;
    const badge=document.createElement("span");
    badge.className="level-number";
    badge.textContent=unlocked?String(level):"🔒";
    const info=document.createElement("span");
    info.className="level-info";
    const title=document.createElement("strong");
    title.textContent=(level===5?"Мастер слов":LEVEL_NAMES[level-1]);
    const detail=document.createElement("small");
    detail.textContent=level===5?"9+ букв и выражения":
      (level+4)+" букв · "+(progress.completed?"Пройден":"20 заданий");
    info.append(title,detail);
    const count=document.createElement("span");
    count.className="level-count";
    count.textContent=progress.solved.size+"/"+wordsInCategory(id,level).length;
    button.append(badge,info,count);
    if (unlocked) button.addEventListener("click",()=>startLevel(id,level));
    levelsList.append(button);
  }
  setHomeView("levels");
}
function startLevel(id,level) {
  if (!levelUnlocked(id,level)) return;
  saveRound();
  selectedCategory=id;
  selectedLevel=level;
  wordProgress=allProgress[id][level];
  wordBank=wordsInCategory(id,level);
  previousWord="";
  startGame();
  showScreen(gameScreen);
}
document.querySelector("#welcomeEnter").addEventListener("click",()=>showScreen(homeScreen));
document.querySelector("#menuPlay").addEventListener("click",showCategories);
document.querySelector("#categoryBack").addEventListener("click",()=>setHomeView("menu"));
document.querySelector("#levelsBack").addEventListener("click",showCategories);
document.querySelector("#gameMenuBack").addEventListener("click",()=>{
  showScreen(homeScreen);
  showLevels(selectedCategory);
});
document.querySelector("#menuSplashBack").addEventListener("click",()=>showScreen(welcomeScreen));
document.querySelector("#menuDetailsBack").addEventListener("click",()=>setHomeView("menu"));
document.querySelector("#menuStats").addEventListener("click",()=>{
  openMenuDetails("СТАТИСТИКА","stats");
  const solved=GAME_CATEGORIES.reduce((sum,c)=>
    sum+Array.from({length:MAX_LEVEL},(_,i)=>i+1)
      .reduce((n,l)=>n+allProgress[c.id][l].solved.size,0),0);
  const lines=[
    ["Угадано",score.wins],["Не угадано",score.losses],
    ["Всего разгадано",solved+"/"+GAME_WORDS.length],
    ...GAME_CATEGORIES.map(c=>[c.icon+" "+c.title,
      Array.from({length:MAX_LEVEL},(_,i)=>i+1)
        .reduce((n,l)=>n+allProgress[c.id][l].solved.size,0)+"/100"])
  ];
  for (const [label,value] of lines) {
    const line=document.createElement("div");
    line.className="home-stat-line";
    const name=document.createElement("span");
    name.textContent=label;
    const number=document.createElement("strong");
    number.textContent=value;
    line.append(name,number);
    detailsBody.append(line);
  }
});
document.querySelector("#menuRules").addEventListener("click",()=>{
  openMenuDetails("КАК ИГРАТЬ","rules");
  const rules=[
    "Выбери категорию и проходи уровни последовательно. На каждом по 20 заданий.",
    "Уровень 1 — 5 букв, уровень 2 — 6, уровень 3 — 7, уровень 4 — 8.",
    "Уровень 5 — длинные слова и составные выражения. Пробелы уже отмечены на игровом поле.",
    "Зелёная буква стоит на месте, жёлтая есть в слове, серая отсутствует.",
    "У тебя 4 попытки и последний шанс вписать недостающие буквы.",
    "После разгадки всех 20 заданий откроется следующий уровень в этой категории."
  ];
  const list=document.createElement("ol");
  for (const rule of rules) {
    const item=document.createElement("li");
    item.textContent=rule;
    list.append(item);
  }
  detailsBody.append(list);
});
startGame();
showScreen(initialUiState.screen==="game"?gameScreen:
  initialUiState.screen==="home"?homeScreen:welcomeScreen);
if (initialUiState.screen==="home") {
  if (initialUiState.homeView==="categories") showCategories();
  else if (initialUiState.homeView==="levels") showLevels(selectedCategory);
  else if (initialUiState.homeView==="stats") document.querySelector("#menuStats").click();
  else if (initialUiState.homeView==="rules") document.querySelector("#menuRules").click();
}

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
