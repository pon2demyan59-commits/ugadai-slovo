// Запуск: node tests/check-release.cjs
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const required=[
  "index.html","style.css","stats.css","rewards.css","script.js","stats.js","rewards.js",
  "yandex-platform.js","cloud-save.js","game-bootstrap.js","hints.js","analytics.js","audio.js",
  "data/words.js","data/valid-words.js","data/valid-long-words.js",
  "data/long-words-loader.js","data/DICTIONARY_LICENSE.txt",
  "assets/icon.svg","manifest.webmanifest"
];
const categoryFiles=["animals","nature","food","home","city","tech","slang","cinema","sport","travel"]
  .map(name=>"data/levels/"+name+".js");
for(const file of [...required,...categoryFiles]){
  assert(fs.existsSync(path.join(root,file)),"Отсутствует "+file);
}
for(const file of [...required,...categoryFiles].filter(file=>file.endsWith(".js"))){
  new vm.Script(fs.readFileSync(path.join(root,file),"utf8"),{filename:file});
}
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
for(const file of [...required,...categoryFiles].filter(file=>/\.js$/.test(file)&&
  !["data/valid-long-words.js","script.js"].includes(file))){
  if(file==="rewards.js"||file==="yandex-platform.js"||file==="cloud-save.js"||file==="game-bootstrap.js"||
    file==="hints.js"||file==="analytics.js"||file==="audio.js"||
    file==="data/words.js"||file==="data/valid-words.js"||file==="data/long-words-loader.js"||
    file==="stats.js"||file.startsWith("data/levels/")){
      assert(html.includes('src="'+file+'"'),"Не подключён "+file);
  }
}
assert(html.includes('src="game-bootstrap.js"'),"Нет загрузчика игры");
assert(html.includes('id="nicknameInput"')&&html.includes('id="menuReward"'),"Нет ника или секретной награды");
// UI: рекламная награда выбирается игровыми карточками; имя не раскрывает пасхалку.
assert(html.includes('id="hintAdKind" class="bonus-choices"') &&
  (html.match(/name="hintAdKind"/g)||[]).length===6,
  "Должно быть шесть карточек рекламных бонусов");
assert(html.includes('id="streakPraise"'),"Нет блока похвалы за серию побед");
assert(html.includes("Как тебя зовут в игре?") && !html.includes("Твой ник для секретной грамоты"),
  "Поле ника не должно раскрывать секретную награду");
assert(!html.includes('<script src="script.js"'),"script.js должен загружаться после облачных сохранений");
const context={};
vm.createContext(context);
for(const file of ["data/words.js",...categoryFiles]){
  vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context,{filename:file});
}
const bank=vm.runInContext("({categories:GAME_CATEGORIES,words:GAME_WORDS})",context);
assert.equal(bank.categories.length,10,"Должно быть 10 категорий");
assert.equal(bank.words.length,1000,"Должно быть 1000 заданий");
assert.equal(new Set(bank.words.map(word=>word.word)).size,1000,"Есть повторяющиеся задания");
for(const cat of bank.categories){
  for(let level=1;level<=5;level++){
    const words=bank.words.filter(w=>w.category===cat.id&&w.level===level);
    assert.equal(words.length,20,cat.id+" уровень "+level+": необходимо 20 слов");
    assert(words.every(w=>typeof w.hint==="string"&&w.hint.trim()),"Отсутствует подсказка");
    if(level<5)assert(words.every(w=>w.word.length===level+4),"Неверная длина слова");
  }
}
// Части десяти печатей вычисляются из пройденных уровней, включая старые сохранения.
const storage=new Map();
context.localStorage={
  getItem:key=>storage.get(key)||null,
  setItem:(key,value)=>storage.set(key,value)
};
context.window={GameCloud:{schedule(){}}};
vm.runInContext(fs.readFileSync(path.join(root,"rewards.js"),"utf8"),context,
  {filename:"rewards.js"});
const rewards=context.window.GameRewards;
const emptyProgress={};
const fullProgress={};
for(const cat of bank.categories){
  emptyProgress[cat.id]={};fullProgress[cat.id]={};
  for(let level=1;level<=5;level++){
    emptyProgress[cat.id][level]={solved:new Set()};
    fullProgress[cat.id][level]={
      solved:new Set(bank.words.filter(w=>w.category===cat.id&&w.level===level).map(w=>w.word))
    };
  }
}
const categoryWords=(id,level)=>bank.words.filter(w=>w.category===id&&w.level===level).map(w=>w.word);
assert.equal(rewards.earnedCount(emptyProgress,bank.categories,5,categoryWords),0);
assert.equal(rewards.earnedCount(fullProgress,bank.categories,5,categoryWords),10);
assert.equal(rewards.earnedParts(emptyProgress,bank.categories,5,categoryWords),0);
assert.equal(rewards.earnedParts(fullProgress,bank.categories,5,categoryWords),50);
const oneLevelProgress={...emptyProgress,animals:{...emptyProgress.animals,
  1:{solved:new Set(categoryWords("animals",1))}}};
assert.equal(rewards.earnedParts(oneLevelProgress,bank.categories,5,categoryWords),1,
  "За двадцать слов должна появляться первая часть печати");
assert.equal(rewards.earnedCount(oneLevelProgress,bank.categories,5,categoryWords),0,
  "Целая печать открывается только после пяти уровней");

const nameResult=rewards.saveNickname("Варрон");
assert.equal(nameResult.ok,true);
assert.equal(rewards.getNickname(),"Варрон");
assert.equal(rewards.saveNickname("<script>").ok,false,"Ник должен быть безопасным");
assert(JSON.parse(storage.get("ugadai-slovo-profile-v1")).nickname==="Варрон",
  "Ник не записан в локальное хранилище");
const script=fs.readFileSync(path.join(root,"script.js"),"utf8");
// Слова из серии берём из постоянной статистики, начиная со второй победы.
const praiseMatch=script.match(/function praiseForStreak\(streak\)\{[\s\S]*?\n\}/);
assert(praiseMatch,"Не найдена логика похвалы за серию побед");
const praise=vm.runInNewContext(praiseMatch[0]+";praiseForStreak");
assert.equal(praise(1),"");
for(const streak of [2,3,4,5,7,10,15,20])
  assert(praise(streak).length>0,"Нет похвалы за "+streak+" побед подряд");
assert(script.includes("focusTypingInput(true)") && script.includes('row.addEventListener("click"'),
  "Поле ввода должно быть доступно по всей строке и автофокусом на ПК");

assert(script.includes('phase="celebrating"')&&script.includes('animateWinningLetters(row).then'),
  "Ранние победы должны запускать перелёт букв");
assert(script.includes('resultQuestion.textContent=currentEntry?.hint||""'),
  "На победном экране должна отображаться загадка");
assert(script.includes('resultAnswer.textContent=(currentEntry?.display||currentWord)'),
  "На победном экране должен отображаться крупный ответ");
assert(html.includes('id="resultQuestion"')&&html.includes('id="resultAnswer"'),
  "Отсутствует разметка загадки и ответа");
const bridge=fs.readFileSync(path.join(root,"yandex-platform.js"),"utf8");
assert(bridge.includes('script.src="/sdk.js"'),"SDK должен подключаться с /sdk.js");
assert(bridge.includes("LoadingAPI")&&bridge.includes("GameplayAPI")&&bridge.includes("showFullscreenAdv"),
  "Проверьте интеграцию SDK");

/* Тест пункта 2.14: SDK-язык считывается при запуске, а для неподдерживаемых
   локализаций используется русский. Проверяем и международный домен Яндекса. */
async function checkPlatformLanguage(){
  for(const [hostname,portalLang,expected] of [
    ["games.yandex.ru","ru","ru"],
    ["games.yandex.com","en","ru"],
    ["games.yandex.kz","kk","ru"]
  ]){
    let reads=0,scriptSrc="";
    const doc={
      hidden:false,
      documentElement:{lang:"ru"},
      addEventListener(){},dispatchEvent(){},
      createElement(){return{};},
      head:{append(script){scriptSrc=script.src;script.onload();}}
    };
    const mockSdk={
      environment:{i18n:{get lang(){reads++;return portalLang;}}},
      features:{LoadingAPI:{ready(){}},GameplayAPI:{start(){},stop(){}}},
      adv:{showRewardedVideo({callbacks}){
        callbacks.onOpen?.();
        if(portalLang==="en")callbacks.onRewarded?.();
        callbacks.onClose?.();
      }}
    };
    const sandbox={
      location:{hostname},
      document:doc,
      Date,Promise,console,Event:class{constructor(type){this.type=type;}},
      window:{YaGames:{init:async()=>mockSdk}}
    };
    vm.createContext(sandbox);
    vm.runInContext(bridge,sandbox,{filename:"yandex-platform.js"});
    assert.equal(await sandbox.window.YandexPlatform.whenSdk,mockSdk);
    assert.equal(scriptSrc,"/sdk.js");
    assert.equal(reads,1,"Язык необходимо читать через SDK при запуске");
    assert.equal(sandbox.window.YandexPlatform.portalLanguage,portalLang);
    assert.equal(sandbox.window.YandexPlatform.language,expected);
    assert.equal(doc.documentElement.lang,expected);
    assert.equal(await sandbox.window.YandexPlatform.showRewarded(),portalLang==="en",
      "Награду выдаём только после onRewarded, а не обычного закрытия рекламы");
  }
  console.log("OK: SDK i18n ru/en/kk, русский fallback, международные домены Яндекса.");
}
checkPlatformLanguage().catch(error=>{console.error(error);process.exitCode=1;});
// При новом открытии страницы — заставка, при обновлении — сохранённый экран.
const startupMatch=script.match(/function startupScreen\(savedScreen,navigationType\) \{[\s\S]*?\n\}/);
assert(startupMatch,"Не найдена логика различения обновления и нового запуска");
const startupScreen=vm.runInNewContext(startupMatch[0]+";startupScreen");
for(const screen of ["welcome","home","game"]){
  assert.equal(startupScreen(screen,"reload"),screen,"Обновление должно сохранять экран");
  assert.equal(startupScreen(screen,"navigate"),"welcome","Новый запуск должен показывать заставку");
}
assert(script.includes('initialScreen=startupScreen(initialUiState.screen,navigationType)'));
assert(script.includes('showScreen(initialScreen==="game"?gameScreen:'),
  "Первый экран должен зависеть от типа навигации");
// Статистика: пятая бонусная попытка не смешивается с последним шансом.
const statStore=new Map([["ugadai-slovo-stats-v1",JSON.stringify({
  distribution:[1,2,3,4,5],streak:0,bestStreak:0,totalDetailed:15})]]);
const statCtx={
  localStorage:{getItem:k=>statStore.get(k)||null,setItem:(k,v)=>statStore.set(k,v)},
  window:{GameCloud:{schedule(){}}},Date,console
};
vm.createContext(statCtx);
vm.runInContext(fs.readFileSync(path.join(root,"stats.js"),"utf8"),statCtx);
assert.equal(statCtx.window.GameStats.snapshot().distribution[5],5,
  "Старый последний шанс переносится в новый шестой столбец");
assert.equal(statCtx.window.GameStats.snapshot().distribution[4],0);
statCtx.window.GameStats.record(true,5,false);
assert.equal(statCtx.window.GameStats.snapshot().distribution[4],1,
  "Пятая попытка учитывается отдельно");

// Экранная клавиатура никогда не зависит от положения курсора.
assert(script.includes("target.value += letter.toLowerCase()"),"Буквы должны добавляться в конец");
assert(script.includes("target.value = target.value.slice(0,-1)"),"Удаление последней буквы");
assert(!script.includes("target.setRangeText("),"Не используйте положение курсора для экранной клавиатуры");
const keyboardCode=script.slice(script.indexOf("function activeLetterInput()"),script.indexOf("function showInputError("));
const keyboardContext={
  phase:"guess",
  guessInput:{value:"кот",maxLength:5,selectionStart:0,selectionEnd:0,
    setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},
    dispatchEvent(){}},
  finalInput:null,
  Event:class{constructor(type,options){this.type=type;this.options=options;}},
  messageElement:{classList:{remove(){}}},
  window:{GameAudio:{play(){}}}
};
vm.createContext(keyboardContext);
vm.runInContext(keyboardCode,keyboardContext);
vm.runInContext("eraseKeyboardLetter()",keyboardContext);
assert.equal(keyboardContext.guessInput.value,"ко","Удаляем последнюю букву даже если курсор в начале");
keyboardContext.guessInput.selectionStart=0;
vm.runInContext('typeKeyboardLetter("Л")',keyboardContext);
assert.equal(keyboardContext.guessInput.value,"кол","Добавляем букву в конец даже если курсор в начале");
assert.equal(keyboardContext.guessInput.selectionStart,3);
console.log("OK: экранная клавиатура удаляет последнюю букву и печатает в конец.");
// Щедрые подсказки: стартовый запас, награды и отсутствие двойной выдачи.
const hintStorage=new Map();
const hintContext={
  localStorage:{getItem:key=>hintStorage.get(key)||null,
    setItem:(key,value)=>hintStorage.set(key,value)},
  window:{GameCloud:{schedule(){}}}
};
vm.createContext(hintContext);
vm.runInContext(fs.readFileSync(path.join(root,"hints.js"),"utf8"),hintContext);
const hint=hintContext.window.GameHints;
assert.equal(hint.balances().letter,8);
assert(hint.spend("letter"));
assert.equal(hint.balances().letter,7);
assert.equal(hint.rewardForWin(3),true);
assert.equal(hint.balances().letter,9);
assert.equal(hint.rewardForWin(3),false,"Не выдавать награду за одни победы дважды");
assert.equal(hint.rewardForLevel("animals",1),true);
assert.equal(hint.rewardForLevel("animals",1),false,"Не выдавать награду за уровень дважды");
assert.equal(hint.balances().letter,12);
assert(script.includes('const maxAttempts = 5')&&script.includes('roundAttemptLimit=baseAttempts+1'),
  "Дополнительная попытка должна добавлять пятую строку");
assert(script.includes('pendingUnknown=guess')&&script.includes('if(pendingUnknown!==guess)'),
  "Неизвестное слово должно приниматься после явного подтверждения");
for(const id of ["hintLetter","hintFirst","hintVowel","hintAttempt","hintEliminate","hintClue","hintAd","hintAdKind"])
  assert(html.includes('id="'+id+'"'),"Нет элемента "+id);
assert(bridge.includes("showRewardedVideo")&&bridge.includes("onRewarded"),
  "Бонусная реклама должна выдавать награду только после SDK onRewarded");
console.log("OK: подсказки, награды, пятая попытка, словарь и рекламный SDK.");
// Ретро-аркада: настройки сохраняются, музыка не стартует до действия игрока,
// рекламный ролик приостанавливает музыку, звуки можно выключать независимо.
assert(html.includes('src="audio.js"'),"Не подключён звуковой движок");
assert.equal((html.match(/data-audio="music"/g)||[]).length,3);
assert.equal((html.match(/data-audio="effects"/g)||[]).length,3);
assert(script.includes('window.GameAudio?.play("win"') ||
  script.includes('window.GameAudio?.play(won?"win":"wrong")'),
  "Победа должна запускать отдельную мелодию");
assert(bridge.includes('game:ad-start')&&bridge.includes('game:ad-end'),
  "Реклама должна приостанавливать музыку");
let createdAudio=0,scheduledMusic=null,activeContext=null;
const audioListeners={};
const audioSaved=new Map();
const fakeDocument={
  hidden:false,
  addEventListener:(name,callback)=>{audioListeners[name]=callback;},
  querySelectorAll:()=>[],
};
class FakeAudioContext{
  constructor(){
    createdAudio++;activeContext=this;this.currentTime=1;this.state="running";
    this.destination={};
  }
  createGain(){return {gain:{value:0,setValueAtTime(){},
    exponentialRampToValueAtTime(){}},connect(){}};}
  createOscillator(){return {frequency:{setValueAtTime(){}},
    connect(){},start(){},stop(){}};}
  resume(){this.state="running";return Promise.resolve();}
  suspend(){this.state="suspended";return Promise.resolve();}
}
const audioSandbox={
  window:{AudioContext:FakeAudioContext},
  document:fakeDocument,
  localStorage:{getItem:key=>audioSaved.get(key)||null,
    setItem:(key,value)=>audioSaved.set(key,value)},
  setInterval:fn=>{scheduledMusic=fn;return 1;},
  console
};
vm.createContext(audioSandbox);
vm.runInContext(fs.readFileSync(path.join(root,"audio.js"),"utf8"),audioSandbox);
const audio=audioSandbox.window.GameAudio;
assert.equal(createdAudio,0,"Автовоспроизведение до пользовательского жеста запрещено");
audio.setScene("home");
assert.equal(createdAudio,0);
audioListeners.pointerdown();
assert.equal(createdAudio,1);
assert.equal(typeof scheduledMusic,"function");
scheduledMusic();
audio.toggle("music");
assert.equal(audio.getSettings().music,false);
assert.equal(JSON.parse(audioSaved.get("ugadai-slovo-audio-v1")).music,false);
assert.equal(audio.getSettings().effects,true,"У музыки и эффектов разные выключатели");
audio.toggle("music");
audioListeners["game:ad-start"]();
assert.equal(activeContext.state,"suspended");
audioListeners["game:ad-end"]();
assert.equal(activeContext.state,"running");
audioListeners.visibilitychange();
assert(!!audioSaved.get("ugadai-slovo-audio-v1"));
console.log("OK: ретро-аудио, независимые настройки, запрет автозапуска и пауза во время рекламы.");
const workflow=fs.readFileSync(path.join(root,".github/workflows/yandex-release.yml"),"utf8");
assert(workflow.includes("analytics.js audio.js"),"Звук не включён в сборку Яндекс Игр");
// Рекламная пауза: после трёх раундов на мобильном, не теряем раунды при отказе SDK.
async function checkMobileInterstitial(hostname){
  let now=1000,requests=0,showNext=false;
  const fakeDoc={
    hidden:false,documentElement:{lang:"ru"},
    addEventListener(){},dispatchEvent(){},createElement(){return{};},
    head:{append(script){script.onload();}}
  };
  const sdk={
    environment:{i18n:{lang:"ru"}},
    features:{LoadingAPI:{ready(){}},GameplayAPI:{start(){},stop(){}}},
    adv:{
      showFullscreenAdv({callbacks}){
        requests++;
        callbacks.onOpen();
        callbacks.onClose(showNext);
      }
    }
  };
  const sandbox={
    location:{hostname},document:fakeDoc,Promise,console,
    Date:{now:()=>now},Event:class{constructor(type){this.type=type;}},
    window:{YaGames:{init:async()=>sdk}}
  };
  vm.createContext(sandbox);
  vm.runInContext(bridge,sandbox);
  await sandbox.window.YandexPlatform.whenSdk;
  const ad=sandbox.window.YandexPlatform;
  ad.roundFinished();ad.roundFinished();
  assert.equal(await ad.showInterstitialIfDue(),false);
  assert.equal(requests,0,"До третьего раунда рекламы нет");
  ad.roundFinished();
  assert.equal(await ad.showInterstitialIfDue(),false);
  assert.equal(requests,1,"После третьего раунда сразу запрос рекламы");
  assert.equal(ad.adDebugStatus().rounds,3,"После onClose(false) раунды сохраняются");
  now+=10000;
  assert.equal(await ad.showInterstitialIfDue(),false);
  assert.equal(requests,1,"Без повторных вызовов в течение минуты");
  now+=60000;showNext=true;
  assert.equal(await ad.showInterstitialIfDue(),true);
  assert.equal(ad.adDebugStatus().rounds,0,"Счётчик обнуляется после показа");
  ad.roundFinished();ad.roundFinished();ad.roundFinished();
  assert.equal(await ad.showInterstitialIfDue(),false);
  assert.equal(requests,2,"После показанной рекламы действует пауза 3 минуты");
  now+=180001;
  assert.equal(await ad.showInterstitialIfDue(),true);
  assert.equal(requests,3,"После паузы новый показ возможен на следующем переходе");
}
Promise.all([checkMobileInterstitial("games.yandex.ru"),
  checkMobileInterstitial("games.yandex.com")]).then(()=>
  console.log("OK: 3 раунда, запрос на телефоне, отказ SDK, повтор и пауза между показами.")
).catch(error=>{console.error(error);process.exitCode=1;});
const worker=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
assert(worker.includes('event.request.mode === "navigate"'),"Нет проверки свежего HTML");
assert(worker.includes('"./audio.js"')&&worker.includes('"./hints.js"'),
  "Новые скрипты должны кэшироваться для офлайн-запуска");

// Повторное прохождение: завершённый уровень должен запускаться заново без сброса основного прогресса.
assert(script.includes("let replayMode=false"),"Нет режима повторного прохождения");
assert(script.includes("replaySolved=new Set()")&&script.includes("replayAttempted=new Set()"),
  "Повторное прохождение должно иметь отдельный временный прогресс");
assert(script.includes("Пройден · можно повторить"),
  "Завершённый уровень должен явно показывать возможность повтора");
assert(script.includes("УРОВЕНЬ ПРОЙДЕН ЕЩЁ РАЗ!"),
  "Нет отдельного результата повторного прохождения");
assert(script.includes("if(complete && won && !replayMode)window.GameHints.rewardForLevel"),
  "Повторное прохождение не должно повторно выдавать награду за уровень");

console.log("OK: 1000 слов, 50 уровней, SDK, ник, облачный профиль и 10 фрагментов награды.");
