// Запуск: node tests/check-release.cjs
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const required=[
  "index.html","style.css","stats.css","rewards.css","script.js","stats.js","rewards.js",
  "yandex-platform.js","cloud-save.js","game-bootstrap.js",
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
const bridge=fs.readFileSync(path.join(root,"yandex-platform.js"),"utf8");
assert(bridge.includes('script.src="/sdk.js"'),"SDK должен подключаться с /sdk.js");
assert(bridge.includes("LoadingAPI")&&bridge.includes("GameplayAPI")&&bridge.includes("showFullscreenAdv"),
  "Проверьте интеграцию SDK");
const worker=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
assert(worker.includes('event.request.mode === "navigate"'),"Нет проверки свежего HTML");
console.log("OK: 1000 слов, 50 уровней, SDK, ник, облачный профиль и 10 фрагментов награды.");
