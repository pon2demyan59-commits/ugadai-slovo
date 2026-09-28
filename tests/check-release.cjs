// Запуск: node tests/check-release.cjs
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const required=[
  "index.html","style.css","stats.css","rewards.css","script.js","stats.js","rewards.js",
  "yandex-platform.js","cloud-save.js","game-bootstrap.js","hints.js","analytics.js",
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
    file==="hints.js"||file==="analytics.js"||
    file==="data/words.js"||file==="data/valid-words.js"||file==="data/long-words-loader.js"||
    file==="stats.js"||file.startsWith("data/levels/")){
      assert(html.includes('src="'+file+'"'),"Не подключён "+file);
  }
}
assert(html.includes('src="game-bootstrap.js"'),"Нет загрузчика игры");
assert(html.includes('id="nicknameInput"')&&html.includes('id="menuReward"'),"Нет ника или секретной награды");
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
// Пасхалка не хранит отдельные фрагменты: они зависят от пройденных категорий.
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
const nameResult=rewards.saveNickname("Варрон");
assert.equal(nameResult.ok,true);
assert.equal(rewards.getNickname(),"Варрон");
assert.equal(rewards.saveNickname("<script>").ok,false,"Ник должен быть безопасным");
assert(JSON.parse(storage.get("ugadai-slovo-profile-v1")).nickname==="Варрон",
  "Ник не записан в локальное хранилище");
const script=fs.readFileSync(path.join(root,"script.js"),"utf8");
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
      addEventListener(){},
      createElement(){return{};},
      head:{append(script){scriptSrc=script.src;script.onload();}}
    };
    const mockSdk={
      environment:{i18n:{get lang(){reads++;return portalLang;}}},
      features:{LoadingAPI:{ready(){}},GameplayAPI:{start(){},stop(){}}}
    };
    const sandbox={
      location:{hostname},
      document:doc,
      Date,Promise,console,
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
  messageElement:{classList:{remove(){}}}
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
for(const id of ["hintLetter","hintAttempt","hintEliminate","hintClue","hintAd","hintAdKind"])
  assert(html.includes('id="'+id+'"'),"Нет элемента "+id);
assert(bridge.includes("showRewardedVideo")&&bridge.includes("onRewarded"),
  "Бонусная реклама должна выдавать награду только после SDK onRewarded");
console.log("OK: подсказки, награды, пятая попытка, словарь и рекламный SDK.");
const worker=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
assert(worker.includes('event.request.mode === "navigate"'),"Нет проверки свежего HTML");
console.log("OK: 1000 слов, 50 уровней, SDK, ник, облачный профиль и 10 фрагментов награды.");
