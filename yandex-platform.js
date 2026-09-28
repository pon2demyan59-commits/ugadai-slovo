/* SDK Яндекс Игр: безопасная интеграция и реклама между раундами. */
(function () {
  "use strict";
  const host=location.hostname.toLowerCase();
  // Яндекс Игры могут открываться не только на yandex.ru.
  const isYandex=/(^|\.)yandex\.(ru|com|net|by|kz|uz)$/.test(host);
  let sdk=null,uiReady=false,desiredGameplay=false,gameplayActive=false;
  let portalLanguage=null,gameLanguage="ru";
  let settleSdk;
  const whenSdk=new Promise(resolve=>{settleSdk=resolve;});
  // Показываем на естественной паузе после трёх завершённых раундов.
  // Платформа может отказать в показе (нет подходящей рекламы, частотный лимит).
  // В этом случае сохраняем счётчик и повторяем не раньше, чем через минуту,
  // на следующем переходе, но НИКОГДА не запускаем рекламу по таймеру.
  const ROUNDS_PER_AD=3,MIN_AD_INTERVAL=180000,RETRY_INTERVAL=60000;
  let adActive=false,finishedRounds=0,lastAd=0,lastRequest=0;
  let adStatus="waiting";
  function setAdActive(active){
    const next=Boolean(active);
    if(adActive===next)return;
    adActive=next;
    document.dispatchEvent(new Event(next?"game:ad-start":"game:ad-end"));
    syncGameplay();
  }
  function syncGameplay() {
    if(!sdk || !uiReady)return;
    const shouldRun=desiredGameplay && !document.hidden && !adActive;
    if(shouldRun===gameplayActive)return;
    gameplayActive=shouldRun;
    try {
      if(shouldRun)sdk.features.GameplayAPI?.start();
      else sdk.features.GameplayAPI?.stop();
    }catch(error){console.warn("GameplayAPI:",error);}
  }
  function init(){
    if(!isYandex){settleSdk(null);return;}
    const script=document.createElement("script");
    script.src="/sdk.js";script.async=true;
    script.onload=async()=>{
      if(!window.YaGames){console.warn("SDK отсутствует");settleSdk(null);return;}
      try{
        sdk=await window.YaGames.init();
        // П. 2.14: читаем язык платформы на старте, даже при единственной локализации.
        // Сейчас доступен только русский; другие языки используют русский как резервный.
        portalLanguage=sdk.environment.i18n.lang;
        const supportedLanguages=["ru"];
        gameLanguage=supportedLanguages.includes(portalLanguage)?portalLanguage:"ru";
        document.documentElement.lang=gameLanguage;
        window.YandexPlatform.portalLanguage=portalLanguage;
        window.YandexPlatform.language=gameLanguage;
        settleSdk(sdk);
        if(uiReady)sdk.features.LoadingAPI?.ready();
        syncGameplay();
      }catch(error){console.warn("Ошибка инициализации SDK:",error);settleSdk(null);}
    };
    script.onerror=()=>{console.warn("Не удалось загрузить /sdk.js");settleSdk(null);};
    document.head.append(script);
  }
  function ready(){
    uiReady=true;
    try{sdk?.features.LoadingAPI?.ready();}
    catch(error){console.warn("LoadingAPI:",error);}
    syncGameplay();
  }
  function setGameplay(active){desiredGameplay=Boolean(active);syncGameplay();}
  function roundFinished(){finishedRounds++;setGameplay(false);}
  function adDebugStatus(){
    const now=Date.now();
    return {sdkReady:Boolean(sdk),rounds:finishedRounds,
      targetRounds:ROUNDS_PER_AD,active:adActive,status:adStatus,
      untilEligibleMs:lastAd?Math.max(0,MIN_AD_INTERVAL-(now-lastAd)):0,
      retryInMs:Math.max(0,RETRY_INTERVAL-(now-lastRequest))};
  }
  function showInterstitialIfDue(){
    const now=Date.now();
    // Даже если реклама недоступна, новый раунд начинается сразу.
    if(!sdk?.adv?.showFullscreenAdv){adStatus="sdk_unavailable";return Promise.resolve(false);}
    if(adActive){adStatus="ad_in_progress";return Promise.resolve(false);}
    if(finishedRounds<ROUNDS_PER_AD){adStatus="not_enough_rounds";return Promise.resolve(false);}
    if(lastAd&&now-lastAd<MIN_AD_INTERVAL){adStatus="min_interval";return Promise.resolve(false);}
    if(lastRequest&&now-lastRequest<RETRY_INTERVAL){adStatus="retry_interval";return Promise.resolve(false);}
    lastRequest=now;
    adStatus="requested";
    setAdActive(true);
    return new Promise(resolve=>{
      let settled=false;
      function finish(shown){
        if(settled)return;
        settled=true;
        if(shown){
          finishedRounds=0;
          lastAd=Date.now();
          adStatus="shown";
        }else{
          // При onClose(false) или onError Яндекс не показал объявление.
          // Не теряем набранные раунды: следующий шанс будет на новой паузе.
          adStatus="not_shown";
          console.info("Яндекс не показал рекламу; повторим на следующем переходе.",adDebugStatus());
        }
        setAdActive(false);
        resolve(Boolean(shown));
      }
      try{
        sdk.adv.showFullscreenAdv({callbacks:{
          onOpen:()=>{adStatus="opened";setAdActive(true);},
          onClose:shown=>finish(shown===true),
          onError:error=>{console.warn("Реклама:",error);finish(false);}
        }});
      }catch(error){console.warn("Ошибка рекламы:",error);finish(false);}
    });
  }
  // Бонусная реклама всегда добровольная. Награда подтверждается только
  // onRewarded, закрытие рекламы само по себе бонус не выдаёт.
  function showRewarded(){
    if(!sdk?.adv?.showRewardedVideo || adActive)return Promise.resolve(false);
    setAdActive(true);
    return new Promise(resolve=>{
      let settled=false,rewarded=false;
      function finish(){
        if(settled)return;
        settled=true;setAdActive(false);resolve(rewarded);
      }
      try{
        sdk.adv.showRewardedVideo({callbacks:{
          onOpen:()=>setAdActive(true),
          onRewarded:()=>{rewarded=true;},
          onClose:finish,
          onError:error=>{console.warn("Бонусная реклама:",error);finish();}
        }});
      }catch(error){console.warn("Бонусная реклама:",error);finish();}
    });
  }
  document.addEventListener("visibilitychange",syncGameplay);
  window.YandexPlatform={isYandex,whenSdk,ready,setGameplay,roundFinished,showInterstitialIfDue,
    showRewarded,adDebugStatus,portalLanguage,language:gameLanguage};
  init();
})();
