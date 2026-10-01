/* Щедрые подсказки: баланс хранится отдельно от прогресса раунда.
   Читаем localStorage при каждом обращении, чтобы учесть облачное восстановление
   до загрузки script.js. Рекламную награду выдаёт только подтверждённый SDK. */
(function(){
  "use strict";
  const KEY="ugadai-slovo-hints-v1";
  const TYPES=["letter","first","vowel","attempt","eliminate","clue"];
  const START={letter:8,first:4,vowel:4,attempt:3,eliminate:4,clue:4};
  function validCount(n){return Number.isSafeInteger(n)&&n>=0?Math.min(n,10000):0;}
  function read(){
    let saved=null;
    try{saved=JSON.parse(localStorage.getItem(KEY)||"null");}catch{}
    if(!saved||saved.version!==1)return{
      version:1,updatedAt:Number.isSafeInteger(saved?.updatedAt)?saved.updatedAt:0,balances:{...START},rewardedWins:0,rewardedLevels:[]};
    return{
      version:1,updatedAt:Number.isSafeInteger(saved?.updatedAt)?saved.updatedAt:0,
      balances:Object.fromEntries(TYPES.map(t=>[t,validCount(saved.balances?.[t])])),
      rewardedWins:validCount(saved.rewardedWins),
      rewardedLevels:Array.isArray(saved.rewardedLevels)?
        saved.rewardedLevels.filter(v=>typeof v==="string"&&/^[a-z]+:[1-5]$/.test(v)):[]
    };
  }
  function save(data){
    try{localStorage.setItem(KEY,JSON.stringify({...data,updatedAt:Date.now()}));}catch{}
    window.GameCloud?.schedule?.();
    return data;
  }
  function balances(){return {...read().balances};}
  function spend(kind){
    if(!TYPES.includes(kind))return false;
    const data=read();
    if(data.balances[kind]<1)return false;
    data.balances[kind]--;
    save(data);
    return true;
  }
  function grant(kind,amount){
    if(!TYPES.includes(kind)||!Number.isSafeInteger(amount)||amount<1)return false;
    const data=read();
    data.balances[kind]=Math.min(10000,data.balances[kind]+amount);
    save(data);
    return true;
  }
  function rewardForWin(wins){
    if(!Number.isSafeInteger(wins)||wins<1)return false;
    const data=read();
    // Каждые 3 победы: +2 буквы и одна подсказка по циклу.
    const old=Math.floor(data.rewardedWins/3);
    const current=Math.floor(wins/3);
    if(current<=old)return false;
    for(let n=old+1;n<=current;n++){
      data.balances.letter+=2;
      const type=["first","vowel","attempt","eliminate","clue"][(n-1)%5];
      data.balances[type]++;
    }
    data.rewardedWins=wins;
    save(data);
    return true;
  }
  function rewardForLevel(category,level){
    const key=category+":"+level;
    const data=read();
    if(data.rewardedLevels.includes(key))return false;
    data.rewardedLevels.push(key);
    data.balances.letter+=3;
    data.balances.first++;
    data.balances.vowel++;
    data.balances.attempt++;
    data.balances.eliminate++;
    data.balances.clue++;
    save(data);
    return true;
  }
  window.GameHints={read,balances,spend,grant,rewardForWin,rewardForLevel};
})();
