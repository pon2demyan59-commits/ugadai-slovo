/* Приватные игровые события: никаких ников, слов или персональных данных.
   Встроенная аналитика Яндекс Игр доступна в консоли после публикации.
   Для кастомных целей можно позднее подключить счётчик Метрики и задать ID. */
(function(){
  "use strict";
  const ALLOWED=new Set(["game_start","round_win","round_loss","hint_used",
    "reward_ad_open","reward_ad_rewarded","reward_ad_error","dictionary_miss"]);
  function track(name){
    if(!ALLOWED.has(name))return;
    const id=window.GAME_METRIKA_ID;
    if(Number.isSafeInteger(id)&&id>0&&typeof window.ym==="function"){
      try{window.ym(id,"reachGoal",name);}catch(error){console.warn("Метрика:",error);}
    }
  }
  window.GameAnalytics={track};
})();
