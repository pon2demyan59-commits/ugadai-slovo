const maxAttempts = 5; // Максимум с бонусом; стандартно у игрока 4 попытки.
const baseAttempts = 4;
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
  // Последний шанс — отдельная категория статистики (после четырёх попыток).
  window.GameStats.record(won,currentAttempt,phase==="final");
  if (won) score.wins++;
  else score.losses++;
  try {
    localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(score));
    window.GameCloud.schedule();
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
// v41: каждый запуск начинается со стартовой страницы.
const allProgress = loadAllProgress();
const initialUiState = loadUiState();
const initialScreen = "welcome";
try {
  localStorage.removeItem(UI_STORAGE_KEY);
} catch {}
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
    window.GameCloud.schedule();
  } catch { /* При отключённом хранилище прогресс живёт до закрытия игры. */ }
}
function saveRound() {
  if (replayMode || restoringRound || !wordProgress.active || phase==="finished") return;
  wordProgress.round={word:currentWord,guesses:[...roundGuesses],
    draft:phase==="guess" && guessInput ? guessInput.value : "",
    finalDraft:phase==="final" ? finalInput.value : "",
    hints:JSON.parse(JSON.stringify(roundHints))};
  saveWordProgress();
}
function chooseNextWord() {
  const attempted=replayMode?replayAttempted:wordProgress.attempted;
  const solved=replayMode?replaySolved:wordProgress.solved;
  const fresh=wordBank.filter(w=>!attempted.has(w));
  const unsolved=wordBank.filter(w=>!solved.has(w));
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
  refreshRewardCounter();
  resultTitle.textContent="УРОВЕНЬ "+selectedLevel+" ПРОЙДЕН!";
  resultText.textContent="Все 20 заданий категории разгаданы!"+(selectedLevel<MAX_LEVEL?" Следующий уровень открыт. Первая часть печати уже ждёт тебя в разделе «Тайна десяти печатей».":" Категория полностью пройдена! Все пять частей печати собраны.");
  nextWordButton.textContent="К уровням";
  resultBackdrop.hidden=false;
  window.GameAudio?.play("puzzle");
  window.YandexPlatform.setGameplay(false);
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
const resultQuestion = document.querySelector("#resultQuestion");
const resultAnswer = document.querySelector("#resultAnswer");
const nextWordButton = document.querySelector("#nextWordButton");
const streakPraise = document.querySelector("#streakPraise");
let guessInput = null;
let currentWord = "";
let currentAttempt = 0;
let usedLetters = {};
let revealed = [];
let phase = "guess";
let previousWord = "";
let roundAttemptLimit=baseAttempts;
let roundHints={positions:[],extraAttempt:false,eliminated:[],extraClue:false};
let revealHintMode=false,pendingUnknown=null;
let replayMode=false;
let replaySolved=new Set();
let replayAttempted=new Set();
const sessionSolvedSize=()=>replayMode?replaySolved.size:wordProgress.solved.size;
const sessionComplete=()=>sessionSolvedSize()===wordBank.length;

let currentEntry=null;
let phraseBreaks=[];
function startGame() {
  const nextWord=!replayMode && wordProgress.active && !wordProgress.solved.has(wordProgress.active)
    ? wordProgress.active : chooseNextWord();
  if (!nextWord) {showCollectionComplete();return;}
  const selected=getEntry(selectedCategory,selectedLevel,nextWord);
  if (!selected) return;
  currentEntry=selected;
  currentWord=nextWord;
  previousWord=nextWord;
  if(replayMode)replayAttempted.add(currentWord);
  else{
    wordProgress.active=currentWord;
    wordProgress.attempted.add(currentWord);
  }
  const parts=(selected.display || selected.word).split(/\s+/).map(s=>s.length);
  phraseBreaks=[];
  let offset=0;
  for (let i=0;i<parts.length-1;i++) {offset+=parts[i];phraseBreaks.push(offset);}
  const resume=!replayMode && wordProgress.round && wordProgress.round.word===nextWord ? wordProgress.round : null;
  const previousHints=resume?.hints || {};
  roundHints={
    positions:Array.isArray(previousHints.positions)?previousHints.positions.filter(i=>
      Number.isInteger(i)&&i>=0&&i<nextWord.length):[],
    extraAttempt:previousHints.extraAttempt===true,
    eliminated:Array.isArray(previousHints.eliminated)?previousHints.eliminated.filter(x=>
      typeof x==="string"&&x.length===1):[],
    extraClue:previousHints.extraClue===true
  };
  roundAttemptLimit=baseAttempts+(roundHints.extraAttempt?1:0);
  revealHintMode=false;pendingUnknown=null;
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
  resultQuestion.hidden=true;
  resultAnswer.hidden=true;
  previewElement.classList.remove("victory-glow");
  resultBanner.classList.remove("win","lose");
  hintElement.textContent=selected.hint;
  const cat=GAME_CATEGORIES.find(c=>c.id===selectedCategory);
  document.querySelector("#activeCategoryTitle").textContent=cat.icon+" "+cat.title+" · Уровень "+selectedLevel;
  messageElement.textContent="Угадай слово!";
  window.GameAudio?.setScene("game");
  renderBoard();
  renderPreview();
  renderAlphabet();
  updateStats();
  if (resume) {
    for (const guess of resume.guesses) {
      if (phase!=="guess") break;
      checkGuess(guess);
    }
    for(const position of roundHints.positions)revealed[position]=true;
    if(roundHints.positions.length)renderPreview();
    if (phase==="final") {
      finalInput.maxLength=revealed.filter(value=>!value).length;
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
  renderHints();
  window.GameAnalytics?.track("game_start");
  window.YandexPlatform.setGameplay(true);
  saveRound();
  saveWordProgress();
  focusTypingInput(true);
}

// На компьютере печать начинается сразу, а касание любой клетки
// активирует единое поле всей строки, без второго клика.
function focusTypingInput(desktopOnly=false) {
  if(desktopOnly && !window.matchMedia?.("(pointer: fine)")?.matches)return;
  const input=phase==="final"?finalInput:phase==="guess"?guessInput:null;
  if(!input || input.hidden || !resultBackdrop.hidden)return;
  input.focus({preventScroll:true});
  input.setSelectionRange?.(input.value.length,input.value.length);
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
  // Печатаем всегда слева направо. Клик по невидимому полю не должен
  // перемещать курсор в середину слова и ломать работу кнопки удаления.
  input.addEventListener("focus", () => input.setSelectionRange(input.value.length,input.value.length));
  input.addEventListener("click", () => input.setSelectionRange(input.value.length,input.value.length));
  input.addEventListener("keydown", event => {
    if (["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) {
      event.preventDefault();
      input.setSelectionRange(input.value.length,input.value.length);
    }
  });
  input.addEventListener("input", event => {
    if(event.isTrusted)window.GameAudio?.play(event.inputType==="deleteContentBackward"?"erase":"key");
    syncInput();
    input.setSelectionRange(input.value.length,input.value.length);
    saveRound();
  });
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
    if(r===baseAttempts)row.hidden=!roundHints.extraAttempt;
    row.style.setProperty("--word-length",currentWord.length);
    row.style.setProperty("--columns",columns);
    for (let i=0;i<currentWord.length;i++) {
      const cell=document.createElement("span");
      cell.className="cell";
      if (phraseBreaks.includes(i)) cell.classList.add("word-new-part");
      row.append(cell);
    }
    row.addEventListener("click",()=>{
      if(phase==="guess" && row.classList.contains("active"))focusTypingInput();
    });
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
  focusTypingInput(true);
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
    if(phase==="guess"&&!revealed[i]){
      cell.classList.add("hint-selectable");
      cell.title="Выбрать клетку для открытия";
      cell.addEventListener("click",()=>{
        if(!revealHintMode)return;
        revealHintMode=false;
        if(revealed[i] || roundHints.positions.length>=3 || revealed.filter(x=>!x).length<=1){
          hintStatus.textContent="Нужно оставить хотя бы одну неизвестную букву.";
          return;
        }
        if(!window.GameHints.spend("letter"))return;
        roundHints.positions.push(i);
        window.GameAudio?.play("hint");
        revealed[i]=true;
        renderPreview();renderHints();saveRound();
        window.GameAnalytics?.track("hint_used");
        hintStatus.textContent="Открыта буква «"+currentWord[i].toUpperCase()+"».";
      });
    }
    previewElement.append(cell);
  }
}

// Экранная клавиатура: ввод строго слева направо, удаляем последнюю букву.
// Не используем selectionStart: тап по прозрачному полю мог оставлять курсор
// в произвольной позиции, из-за чего буквы удалялись не по порядку.
function activeLetterInput() {
  return phase === "final" ? finalInput : phase === "guess" ? guessInput : null;
}

function typeKeyboardLetter(letter) {
  const target = activeLetterInput();
  if (!target || target.value.length >= target.maxLength) return;
  target.value += letter.toLowerCase();
  target.setSelectionRange(target.value.length,target.value.length);
  target.dispatchEvent(new Event("input", { bubbles: true }));
  window.GameAudio?.play("key");
  messageElement.classList.remove("is-error");
}

function eraseKeyboardLetter() {
  const target = activeLetterInput();
  if (!target || !target.value.length) return;
  target.value = target.value.slice(0,-1);
  target.setSelectionRange(target.value.length,target.value.length);
  target.dispatchEvent(new Event("input", { bubbles: true }));
  window.GameAudio?.play("erase");
  messageElement.classList.remove("is-error");
}

function showInputError(text) {
  window.GameAudio?.play("wrong");
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
      if(roundHints.eliminated.includes(letter)){
        cell.disabled=true;cell.classList.add("hint-eliminated");
      }
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
  currentAttemptElement.textContent = Math.min(currentAttempt + 1, roundAttemptLimit);
  attemptsLeftElement.textContent = roundAttemptLimit - currentAttempt;
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
  if(!phrase && !known){
    // Расширяем словарь в отдельном обновлении. Сейчас не отклоняем реальные
    // слова: два одинаковых нажатия «Проверить» явно подтверждают попытку.
    if(pendingUnknown!==guess){
      pendingUnknown=guess;
      showInputError(longDictionaryReady?
        "Нет в словаре. Нажми «Проверить» ещё раз, чтобы засчитать попытку.":
        "Словарь загружается. Можно проверить слово повторным нажатием.");
      return;
    }
    window.GameAnalytics?.track("dictionary_miss");
  }
  pendingUnknown=null;
  messageElement.classList.remove("is-error");
  const result = getGuessResult(guess);
  window.GameAudio?.play("check");
  // Снимок верхней строки до проверки нужен для анимации перелёта.
  const previouslyRevealed=[...revealed];
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
  const isWin=guess === currentWord || revealed.every(Boolean);
  if(!isWin && result.some(item=>item.status==="correct"))window.GameAudio?.play("correct");
  else if(!isWin)window.GameAudio?.play("wrong");
  if (isWin && currentAttempt < baseAttempts && !restoringRound) {
    // До 4-й попытки показываем именно перелёт букв, а не мгновенный результат.
    phase="celebrating";
    revealed=previouslyRevealed;
    renderPreview();
    messageElement.textContent="✨ Слово разгадано! Собираем ответ…";
    window.YandexPlatform.setGameplay(false);
    saveWordProgress();
    animateWinningLetters(row).then(()=>{
      revealed.fill(true);
      renderPreview();
      previewElement.classList.add("victory-glow");
      finishGame(true);
    });
    return;
  }
  renderPreview();
  if (isWin) {
    finishGame(true);
  } else if (currentAttempt >= roundAttemptLimit) {
    beginFinalChance();
  } else {
    activateNextRow();
    messageElement.textContent = "Правильные буквы появились в верхней рамке.";
  }
  saveRound();
}

/* Буквы летят из угаданной строки в верхний ответ с небольшим интервалом.
   При сниженной анимации или неподдерживаемом API ответ раскрывается сразу. */
async function animateWinningLetters(sourceRow) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      typeof Element==="undefined" || !Element.prototype.animate) return;
  const source=Array.from(sourceRow.querySelectorAll(".cell"));
  const destination=Array.from(previewElement.querySelectorAll(".preview-cell"));
  const count=Math.min(source.length,destination.length);
  const flights=[];
  for (let i=0;i<count;i++) {
    const from=source[i].getBoundingClientRect();
    const to=destination[i].getBoundingClientRect();
    if (!from.width || !to.width) continue;
    const tile=source[i].cloneNode(true);
    tile.classList.add("victory-flying-letter");
    tile.style.cssText="position:fixed;z-index:60;left:"+from.left+"px;top:"+from.top+
      "px;width:"+from.width+"px;height:"+from.height+"px;pointer-events:none;margin:0;";
    document.body.append(tile);
    const delay=i*75;
    const flight=tile.animate([
      {transform:"translate(0,0) scale(1)",opacity:1,filter:"brightness(1)"},
      {transform:"translate("+(to.left-from.left)*.5+"px,"+
        ((to.top-from.top)*.5-35)+"px) scale(1.24)",opacity:1,filter:"brightness(1.6)",offset:.58},
      {transform:"translate("+(to.left-from.left)+"px,"+(to.top-from.top)+
        "px) scale("+(to.width/from.width)+")",opacity:1,filter:"brightness(1.2)"}
    ],{duration:540,delay,easing:"cubic-bezier(.22,.8,.24,1)",fill:"forwards"});
    const done=flight.finished.catch(()=>{}).then(()=>{
      tile.remove();
      destination[i].textContent=currentWord[i].toUpperCase();
      destination[i].classList.add("is-known","victory-arrived");
    });
    flights.push(done);
  }
  await Promise.all(flights);
  // Последняя доля секунды оставляет собранное слово на экране.
  await new Promise(resolve=>setTimeout(resolve,380));
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

// Похвала начинается со второй победы подряд; серия берётся из сохранённой статистики.
function praiseForStreak(streak){
  if(streak<2)return "";
  if(streak===2)return "🌟 Ты молодец! Два слова подряд!";
  if(streak===3)return "✨ Великолепно! Уже три победы подряд!";
  if(streak===4)return "🔥 Отличный темп! Продолжай!";
  if(streak===5)return "🏆 Пять подряд! Вот это серия!";
  if(streak<10)return "🚀 Невероятно! "+streak+" побед подряд — не останавливайся!";
  if(streak===10)return "👑 Десять подряд! Ты настоящий мастер слова!";
  if(streak<20)return "⚡ Ого! "+streak+" побед подряд! Ты бьёшь рекорды!";
  return "💎 "+streak+" побед подряд! Легендарная серия!";
}
function finishGame(won) {
  if (phase==="finished") return;
  window.GameAudio?.play(won?"win":"wrong");
  recordResult(won);
  const streak=window.GameStats.snapshot().streak;
  streakPraise.textContent=won?praiseForStreak(streak):"";
  streakPraise.hidden=!streakPraise.textContent;
  window.GameAnalytics?.track(won?"round_win":"round_loss");
  if(won)window.GameHints.rewardForWin(score.wins);
  if(won){
    if(replayMode)replaySolved.add(currentWord);
    else wordProgress.solved.add(currentWord);
  }
  const complete=sessionComplete();
  if(complete && !replayMode)wordProgress.completed=true;
  if(complete && won && !replayMode)window.GameHints.rewardForLevel(selectedCategory,selectedLevel);
  if (complete && won && !replayMode) {
    const completed=window.GameRewards.earnedCount(allProgress,GAME_CATEGORIES,MAX_LEVEL,wordsInCategory);
    resultText.dataset.rewardCount=completed;
    if (completed===GAME_CATEGORIES.length) window.GameRewards.ensureIssueDate();
  }
  if(!replayMode){
    wordProgress.active=null;
    wordProgress.round=null;
  }
  saveWordProgress();
  refreshRewardCounter();
  window.GameCloud.flush(); // Победа/поражение сразу отправляются в облако.
  phase="finished";
  guessForm.hidden=true;
  finalInput.hidden=true;
  if (guessInput) {guessInput.remove();guessInput=null;}
  finalForm.classList.remove("active");
  if (won) {
    resultQuestion.hidden=false;
    resultAnswer.hidden=false;
    resultQuestion.textContent=currentEntry?.hint||"";
    resultAnswer.textContent=(currentEntry?.display||currentWord).toLocaleUpperCase("ru-RU");
    revealed.fill(true);
    resultTitle.textContent=complete?(replayMode?"УРОВЕНЬ ПРОЙДЕН ЕЩЁ РАЗ!":"УРОВЕНЬ "+selectedLevel+" ПРОЙДЕН!"):"ПОЗДРАВЛЯЕМ!";
    resultText.textContent=complete
      ? (replayMode?"Все 20 слов снова разгаданы! Отличная тренировка.":"Все 20 слов разгаданы!"+(selectedLevel<MAX_LEVEL?" Следующий уровень открыт.":" Все пять уровней категории завершены!"))
      : "Ты угадал слово! Осталось разгадать: "+(wordBank.length-sessionSolvedSize())+".";
    if (complete && !replayMode) {
      resultText.textContent+= selectedLevel<MAX_LEVEL
        ? " 🧩 Найдена часть таинственной печати! Посмотри её в разделе «Тайна десяти печатей»."
        : " 🧩 Пять частей собраны! Печать категории раскрыта. Загляни в раздел «Тайна десяти печатей».";
      window.GameAudio?.play("puzzle");
    }
    nextWordButton.textContent=complete?"К уровням":"Следующее слово";
    resultBanner.classList.add("win");
  } else {
    resultQuestion.hidden=true;
    resultAnswer.hidden=true;
    resultTitle.textContent="ПОКА НЕ УГАДАНО";
    resultText.textContent="Это слово осталось загадкой. Следующим будет новое, а затем вернёмся к неразгаданным.";
    nextWordButton.textContent="Следующее слово";
    resultBanner.classList.add("lose");
  }
  renderPreview();
  resultBackdrop.hidden=false;
  renderHints();
  window.YandexPlatform.roundFinished();
  nextWordButton.focus();
}

// Щедрый набор подсказок. Расходуем не более двух открытий букв за раунд,
// оставляем хотя бы одну неизвестную букву и не включаем подсказки после победы.
const hintStatus=document.querySelector("#hintStatus");
const hintClueText=document.querySelector("#hintClueText");
const hintButtons={
  letter:document.querySelector("#hintLetter"),
  first:document.querySelector("#hintFirst"),
  vowel:document.querySelector("#hintVowel"),
  attempt:document.querySelector("#hintAttempt"),
  eliminate:document.querySelector("#hintEliminate"),
  clue:document.querySelector("#hintClue")
};
const hintCounts={
  letter:document.querySelector("#hintLetterCount"),
  first:document.querySelector("#hintFirstCount"),
  vowel:document.querySelector("#hintVowelCount"),
  attempt:document.querySelector("#hintAttemptCount"),
  eliminate:document.querySelector("#hintEliminateCount"),
  clue:document.querySelector("#hintClueCount")
};
function renderHints(){
  const stock=window.GameHints.balances();
  for(const type of Object.keys(hintButtons))hintCounts[type].textContent="×"+stock[type];
  hintButtons.letter.disabled=phase!=="guess"||stock.letter<1||
    roundHints.positions.length>=3||revealed.filter(x=>!x).length<=1;
  hintButtons.first.disabled=phase!=="guess"||stock.first<1||
    roundHints.positions.length>=3||revealed[0]||revealed.filter(x=>!x).length<=1;
  hintButtons.vowel.disabled=phase!=="guess"||stock.vowel<1||
    roundHints.positions.length>=3||!Array.from(currentWord).some((c,i)=>
      /[аеёиоуыэюя]/.test(c)&&!revealed[i])||revealed.filter(x=>!x).length<=1;
  hintButtons.attempt.disabled=phase!=="guess"||stock.attempt<1||
    roundHints.extraAttempt||currentAttempt>=baseAttempts;
  hintButtons.eliminate.disabled=phase!=="guess"||stock.eliminate<1||
    roundHints.eliminated.length>0;
  hintButtons.clue.disabled=phase!=="guess"||stock.clue<1||roundHints.extraClue;
  if(roundHints.extraClue){
    const vowels=(currentWord.match(/[аеёиоуыэюя]/g)||[]).length;
    hintClueText.textContent="Дополнительно: в ответе "+vowels+
      " гласных букв"+(phraseBreaks.length?" и "+(phraseBreaks.length+1)+" слова.":".");
    hintClueText.hidden=false;
  }else hintClueText.hidden=true;
}
hintButtons.letter.addEventListener("click",()=>{
  revealHintMode=true;
  hintStatus.textContent="Нажми на вопросительный знак нужной клетки в верхнем ответе.";
});
function revealAutomatic(kind,index){
  if(phase!=="guess"||index<0||roundHints.positions.length>=3||
     revealed[index]||revealed.filter(x=>!x).length<=1||
     !window.GameHints.spend(kind))return;
  roundHints.positions.push(index);
  window.GameAudio?.play("hint");
  revealed[index]=true;
  renderPreview();renderHints();saveRound();
  window.GameAnalytics?.track("hint_used");
  hintStatus.textContent="Открыта буква «"+currentWord[index].toUpperCase()+"».";
}
hintButtons.first.addEventListener("click",()=>revealAutomatic("first",0));
hintButtons.vowel.addEventListener("click",()=>{
  const positions=Array.from(currentWord).map((c,i)=>
    /[аеёиоуыэюя]/.test(c)&&!revealed[i]?i:-1).filter(i=>i>=0);
  if(positions.length)revealAutomatic("vowel",
    positions[Math.floor(Math.random()*positions.length)]);
});
hintButtons.attempt.addEventListener("click",()=>{
  if(phase!=="guess"||roundHints.extraAttempt||!window.GameHints.spend("attempt"))return;
  window.GameAudio?.play("hint");
  roundHints.extraAttempt=true;roundAttemptLimit=baseAttempts+1;
  const lastRow=boardElement.children[baseAttempts];
  if(lastRow)lastRow.hidden=false;
  updateStats();renderHints();saveRound();
  window.GameAnalytics?.track("hint_used");
  hintStatus.textContent="Получена пятая попытка!";
});
hintButtons.eliminate.addEventListener("click",()=>{
  if(phase!=="guess"||roundHints.eliminated.length||!window.GameHints.spend("eliminate"))return;
  const alphabet=keyboardRows.join("").split("");
  const candidates=alphabet.filter(letter=>
    letter!=="Е"&&!currentWord.toUpperCase().includes(letter)&&
    !usedLetters[letter]);
  window.GameAudio?.play("hint");
  roundHints.eliminated=candidates.sort(()=>Math.random()-.5).slice(0,8);
  renderAlphabet();renderHints();saveRound();
  window.GameAnalytics?.track("hint_used");
  hintStatus.textContent="С клавиатуры убраны лишние буквы.";
});
hintButtons.clue.addEventListener("click",()=>{
  if(phase!=="guess"||roundHints.extraClue||!window.GameHints.spend("clue"))return;
  window.GameAudio?.play("hint");
  roundHints.extraClue=true;renderHints();saveRound();
  window.GameAnalytics?.track("hint_used");
});
const adButton=document.querySelector("#hintAd");
adButton.disabled=!window.YandexPlatform.isYandex;
adButton.addEventListener("click",async()=>{
  if(adButton.disabled)return;
  adButton.disabled=true;
  const kind=document.querySelector('input[name="hintAdKind"]:checked').value;
  hintStatus.textContent="Готовим видео с бонусом…";
  window.GameAnalytics?.track("reward_ad_open");
  try{
    const rewarded=await window.YandexPlatform.showRewarded();
    if(rewarded){
      window.GameAudio?.play("hint");
      const amount=["letter","first","vowel"].includes(kind)?3:2;
      window.GameHints.grant(kind,amount);
      window.GameAnalytics?.track("reward_ad_rewarded");
      hintStatus.textContent="Бонус получен: +"+amount+" подсказки!";
    }else{
      window.GameAnalytics?.track("reward_ad_error");
      hintStatus.textContent="Реклама недоступна или не досмотрена. Баланс не изменился.";
    }
  }finally{
    adButton.disabled=false;renderHints();
  }
});
// Если после клика на подсказку фокус оказался на другой кнопке,
// настольная клавиатура всё равно продолжает вводить в текущую строку.
document.addEventListener("keydown",event=>{
  if(event.ctrlKey||event.altKey||event.metaKey||event.repeat||
    document.querySelector("#gameScreen").hidden||!resultBackdrop.hidden)return;
  if(phase!=="guess"&&phase!=="final")return;
  const node=event.target;
  if(node?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(node?.tagName||""))return;
  if(/^[а-яё]$/i.test(event.key)){
    event.preventDefault();
    typeKeyboardLetter(event.key);
    focusTypingInput(true);
  }else if(event.key==="Backspace"){
    event.preventDefault();
    eraseKeyboardLetter();
    focusTypingInput(true);
  }
});

guessForm.addEventListener("submit", event => {
  event.preventDefault();
  if (phase === "guess" && guessInput) checkGuess(guessInput.value.trim().toLowerCase());
});
finalForm.addEventListener("submit", event => {
  event.preventDefault();
  checkFinalChance();
});
finalInput.addEventListener("input", event=>{
  if(event.isTrusted)window.GameAudio?.play(event.inputType==="deleteContentBackward"?"erase":"key");
  cleanFinalInput();
});
finalEntry.addEventListener("click", () => {
  if (phase === "final") finalInput.focus();
});
nextWordButton.addEventListener("click",async ()=>{
  if (nextWordButton.disabled) return;
  nextWordButton.disabled=true;
  try { await window.YandexPlatform.showInterstitialIfDue(); }
  finally { nextWordButton.disabled=false; }
  if (sessionComplete()) {
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
  document.querySelector("#homeArt").hidden=view!=="menu";
  document.querySelector("#menuSettingsDialog").close();
  homeMenu.hidden=view!=="menu";
  document.querySelector("#nicknameForm").hidden=view!=="menu";
  categoryScreen.hidden=view!=="categories";
  levelsScreen.hidden=view!=="levels";
  details.hidden=view!=="stats" && view!=="rules" && view!=="reward";
  homeCard.classList.toggle("subview",view!=="menu");
  homeCard.classList.toggle("stats-open",view==="stats" || view==="reward");
  homeCard.setAttribute("aria-labelledby",{
    menu:"homeTitle",categories:"categoryTitle",levels:"levelsTitle",
    stats:"menuDetailsTitle",rules:"menuDetailsTitle",reward:"menuDetailsTitle"
  }[view]);
  saveUiState();
}
function showScreen(screen) {
  welcomeScreen.hidden=screen!==welcomeScreen;
  homeScreen.hidden=screen!==homeScreen;
  gameScreen.hidden=screen!==gameScreen;
  if (screen===homeScreen) setHomeView("menu");
  if (screen===gameScreen) focusTypingInput(true);
  saveUiState();
  window.YandexPlatform.setGameplay(screen===gameScreen && phase!=="finished");
  window.GameAudio?.setScene(screen===gameScreen?"game":screen===homeScreen?"home":"welcome");
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
    const levelFormat=level===5?"9+ букв и выражения":(level+4)+" букв";
    detail.textContent=levelFormat+" · "+(progress.completed?"Пройден · можно повторить":"20 заданий");
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
  replayMode=wordProgress.completed && wordProgress.solved.size===wordBank.length;
  replaySolved=new Set();
  replayAttempted=new Set();
  previousWord="";
  startGame();
  showScreen(gameScreen);
}
document.querySelector("#welcomeEnter").addEventListener("click",()=>showScreen(homeScreen));
document.querySelector("#welcomeRules")?.addEventListener("click",()=>{
  showScreen(homeScreen);
  document.querySelector("#menuRules")?.click();
});
document.querySelector("#welcomeStats")?.addEventListener("click",()=>{
  showScreen(homeScreen);
  document.querySelector("#menuStats")?.click();
});
document.querySelector("#welcomeRewards")?.addEventListener("click",()=>{
  showScreen(homeScreen);
  document.querySelector("#menuReward")?.click();
});
const menuSettingsDialog=document.querySelector("#menuSettingsDialog");
document.querySelector("#menuSettings").addEventListener("click",()=>menuSettingsDialog.showModal());
menuSettingsDialog.addEventListener("click",event=>{
  if(event.target===menuSettingsDialog){
    const rect=menuSettingsDialog.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)menuSettingsDialog.close();
  }
});
document.querySelector("#menuPlay").addEventListener("click",showCategories);
window.GameDebug?.log("ЭТАП: обработчик Играть подключён");
document.querySelector("#categoryBack").addEventListener("click",()=>setHomeView("menu"));
document.querySelector("#levelsBack").addEventListener("click",showCategories);
document.querySelector("#gameMenuBack").addEventListener("click",()=>{
  saveRound(); // Возврат к уровням не должен терять текущую попытку.
  showScreen(homeScreen);
  showLevels(selectedCategory);
});
document.querySelector("#menuDetailsBack").addEventListener("click",()=>setHomeView("menu"));
// Ник не обязателен для игры; сохраняется локально и через Яндекс ID.
const nickForm=document.querySelector("#nicknameForm");
const nickInput=document.querySelector("#nicknameInput");
const nickMessage=document.querySelector("#nicknameMessage");
const rewardCounter=document.querySelector("#rewardCounter");
window.GameDebug?.log("ЭТАП: перед загрузкой никнейма; GameRewards="+Boolean(window.GameRewards));
nickInput.value=window.GameRewards.getNickname()==="Игрок"?"":window.GameRewards.getNickname();
window.GameDebug?.log("ЭТАП: никнейм прочитан");
nickForm.addEventListener("submit",event=>{
  event.preventDefault();
  const saved=window.GameRewards.saveNickname(nickInput.value);
  nickMessage.textContent=saved.ok?"✓ Имя сохранено: "+saved.nickname:saved.message;
  if(saved.ok) nickInput.value=saved.nickname;
});
function refreshRewardCounter(){
  const earned=window.GameRewards.earnedCount(allProgress,GAME_CATEGORIES,MAX_LEVEL,wordsInCategory);
  const parts=window.GameRewards.earnedParts(allProgress,GAME_CATEGORIES,MAX_LEVEL,wordsInCategory);
  rewardCounter.textContent=earned+"/10 · "+parts+"/50";
  document.querySelector("#menuSealCount").textContent=earned+"/10";
  document.querySelector("#menuPartCount").textContent=parts+"/50";
}
window.GameDebug?.log("ЭТАП: перед расчётом пазла");
refreshRewardCounter();
window.GameDebug?.log("ЭТАП: пазл рассчитан");
document.querySelector("#menuReward").addEventListener("click",()=>{
  openMenuDetails("ТАЙНА ДЕСЯТИ ПЕЧАТЕЙ","reward");
  window.GameRewards.render(detailsBody,allProgress,GAME_CATEGORIES,
    MAX_LEVEL,wordsInCategory,score);
});
document.querySelector("#menuStats").addEventListener("click",()=>{
  openMenuDetails("МОЯ СТАТИСТИКА","stats");
  window.GameStatsPanel.render(detailsBody,score,allProgress,GAME_CATEGORIES,
    GAME_WORDS.length,MAX_LEVEL,wordsInCategory);
  window.GameRewards.appendProgress(detailsBody,allProgress,GAME_CATEGORIES,MAX_LEVEL,wordsInCategory);
});
const cloudButton=document.querySelector("#menuCloud");
if (window.YandexPlatform.isYandex && !window.GameCloud.isAuthorized()) cloudButton.hidden=false;
cloudButton.addEventListener("click",async ()=>{
  cloudButton.disabled=true;
  try {
    const signedIn=await window.GameCloud.signIn();
    if(!signedIn){cloudButton.disabled=false;}
  } catch(error) {
    console.warn("Не удалось войти:",error);
    cloudButton.disabled=false;
  }
});
window.GameDebug?.log("ЭТАП: статистика и награда подключены");
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
showScreen(initialScreen==="game"?gameScreen:
  initialScreen==="home"?homeScreen:welcomeScreen);

window.YandexPlatform.ready();

