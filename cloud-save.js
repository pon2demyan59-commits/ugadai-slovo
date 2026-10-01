/* Облачное сохранение для авторизованных игроков Яндекс Игр.
   Гости продолжают играть с локальными сохранениями. */
(function(){
  "use strict";
  const CLOUD_KEY="ugadaiSlovoV1";
  const KEYS={
    progress:"ugadai-slovo-category-level-progress-v3",
    score:"ugadai-slovo-score-v1",
    stats:"ugadai-slovo-stats-v1",
    profile:"ugadai-slovo-profile-v1",
    hints:"ugadai-slovo-hints-v1"
  };
  let player=null, timer=null, pending=false, saving=false;
  function read(key){try{return JSON.parse(localStorage.getItem(key)||"null");}catch{return null;}}
  function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
  function arrayUnion(a,b){
    return [...new Set([...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[])])];
  }
  function nonnegative(n){return Number.isSafeInteger(n)&&n>=0?n:0;}
  function mergeProgress(local,remote){
    if(!remote||typeof remote!=="object")return local||null;
    const merged=local&&typeof local==="object"?JSON.parse(JSON.stringify(local)):{};
    for(const [category,levels] of Object.entries(remote)){
      if(!levels||typeof levels!=="object")continue;
      if(!merged[category])merged[category]={};
      for(const [level,entry] of Object.entries(levels)){
        if(!entry||typeof entry!=="object")continue;
        const previous=merged[category][level]||{};
        const solved=arrayUnion(previous.solved,entry.solved);
        const attempted=arrayUnion(previous.attempted,entry.attempted);
        const localRound=previous.active&&previous.round?.word===previous.active;
        const cloudRound=entry.active&&entry.round?.word===entry.active;
        const chosen=localRound?previous:cloudRound?entry:previous.active?previous:entry;
        const active=chosen.active&&!solved.includes(chosen.active)?chosen.active:null;
        merged[category][level]={
          solved,attempted:arrayUnion(attempted,solved),active,
          round:active?(chosen.round||null):null,
          completed:Boolean(previous.completed||entry.completed)
        };
      }
    }
    return merged;
  }
  function mergeScore(a,b){
    if(!b||typeof b!=="object")return a;
    return {
      wins:Math.max(nonnegative(a?.wins),nonnegative(b.wins)),
      losses:Math.max(nonnegative(a?.losses),nonnegative(b.losses))
    };
  }
  function mergeStats(a,b){
    if(!b||typeof b!=="object")return a;
    const result={...(a||{})};
    for(const key of ["bestStreak","bestDays","totalDetailed"]){
      result[key]=Math.max(nonnegative(a?.[key]),nonnegative(b[key]));
    }
    const norm=x=>x?.distribution?.length===5?
      [...x.distribution.slice(0,4),0,x.distribution[4]]:x?.distribution||[];
    const da=norm(a),db=norm(b);
    result.distribution=Array.from({length:6},(_,i)=>
      Math.max(nonnegative(da[i]),nonnegative(db[i])));
    result.recentDays={...(b.recentDays||{}),...(a?.recentDays||{})};
    for(const [day,count] of Object.entries(b.recentDays||{})){
      result.recentDays[day]=Math.max(nonnegative(result.recentDays[day]),nonnegative(count));
    }
    const newer=(a?.lastWinDay||"")>=(b.lastWinDay||"")?a:b;
    result.lastWinDay=newer?.lastWinDay||null;
    result.streak=nonnegative(newer?.streak);
    result.consecutiveDays=nonnegative(newer?.consecutiveDays);
    return result;
  }
  function mergeHints(local,remote){
    if(!remote||remote.version!==1)return local;
    if(!local||local.version!==1)return remote;
    const balances={};
    for(const key of ["letter","first","vowel","attempt","eliminate","clue"]){
      const latest=nonnegative(remote.updatedAt)>nonnegative(local.updatedAt)?remote:local;
      balances[key]=nonnegative(latest.balances?.[key]);
    }
    return {version:1,updatedAt:Math.max(nonnegative(local.updatedAt),nonnegative(remote.updatedAt)),balances,
      rewardedWins:Math.max(nonnegative(local.rewardedWins),nonnegative(remote.rewardedWins)),
      rewardedLevels:arrayUnion(local.rewardedLevels,remote.rewardedLevels)};
  }
  function snapshot(){
    return {version:1,progress:read(KEYS.progress),score:read(KEYS.score),stats:read(KEYS.stats),profile:read(KEYS.profile),hints:read(KEYS.hints)};
  }
  async function prepare(){
    if(!window.YandexPlatform.isYandex)return;
    // При проблемах с платформой не блокируем запуск игры бесконечно.
    const sdk=await Promise.race([
      window.YandexPlatform.whenSdk,
      new Promise(resolve=>setTimeout(()=>resolve(null),6000))
    ]);
    if(!sdk)return;
    try{
      const candidate=await Promise.race([sdk.getPlayer(),new Promise(resolve=>setTimeout(()=>resolve(null),6000))]);
      if(!candidate?.isAuthorized?.())return;
      player=candidate;
      const response=await Promise.race([
        player.getData([CLOUD_KEY]),
        new Promise(resolve=>setTimeout(()=>resolve(null),6000))
      ]);
      if(response===null){player=null;return;} // Сетевая ошибка: не перезаписываем неизвестное облачное состояние.
      const cloud=response?.[CLOUD_KEY];
      if(cloud&&typeof cloud==="object"&&cloud.version===1){
        const progress=mergeProgress(read(KEYS.progress),cloud.progress);
        const score=mergeScore(read(KEYS.score),cloud.score);
        const stats=mergeStats(read(KEYS.stats),cloud.stats);
        if(progress)write(KEYS.progress,progress);
        if(score)write(KEYS.score,score);
        if(stats)write(KEYS.stats,stats);
        const hints=mergeHints(read(KEYS.hints),cloud.hints);
        if(hints)write(KEYS.hints,hints);
        window.GameStats?.reload?.();
        const localProfile=read(KEYS.profile)||{};
        const remoteProfile=cloud.profile&&typeof cloud.profile==="object"?cloud.profile:{};
        const chosenNick=typeof localProfile.nickname==="string"&&localProfile.nickname.trim()?localProfile.nickname:remoteProfile.nickname;
        const nick=typeof chosenNick==="string"&&chosenNick.length<=24&&/^[a-zа-яё0-9 _-]{2,24}$/iu.test(chosenNick)?chosenNick:"";
        const dates=[localProfile.certificateDate,remoteProfile.certificateDate].filter(d=>typeof d==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
        write(KEYS.profile,{nickname:nick,certificateDate:dates[0]||""});
        window.GameRewards?.reload?.();
      }
    }catch(error){console.warn("Облачное сохранение недоступно:",error);player=null;}
  }
  async function flush(){
    if(!player){return;}
    if(saving){pending=true;return;}
    if(timer){clearTimeout(timer);timer=null;}
    saving=true;pending=false;
    try{await player.setData({[CLOUD_KEY]:snapshot()},true);}
    catch(error){console.warn("Не удалось сохранить прогресс в облако:",error);}
    finally{
      saving=false;
      if(pending){pending=false;schedule();}
    }
  }
  function schedule(){
    if(!player)return;
    if(saving){pending=true;return;}
    if(timer)clearTimeout(timer);
    timer=setTimeout(flush,7000);
  }
  async function signIn(){
    if(!window.YandexPlatform.isYandex)return false;
    const sdk=await window.YandexPlatform.whenSdk;
    if(!sdk?.auth?.openAuthDialog)return false;
    try{
      await sdk.auth.openAuthDialog();
      const candidate=await sdk.getPlayer();
      if(!candidate?.isAuthorized?.())return false;
      location.reload(); // После явного входа объединяем локальные и облачные данные.
      return true;
    }catch(error){console.warn("Вход через Яндекс ID:",error);return false;}
  }
  window.GameCloud={prepare,schedule,flush,signIn,isAuthorized:()=>Boolean(player),mergeProgress};
})();
