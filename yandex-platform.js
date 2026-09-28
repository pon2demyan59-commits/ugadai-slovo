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
  let adActive=false,finishedRounds=0,lastAd=Date.now();
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
  function showInterstitialIfDue(){
    if(!sdk?.adv?.showFullscreenAdv || adActive || finishedRounds<4 ||
      Date.now()-lastAd<180000)return Promise.resolve(false);
    finishedRounds=0;lastAd=Date.now();setAdActive(true);
    return new Promise(resolve=>{
      let settled=false;
      function finish(shown){
        if(settled)return;settled=true;setAdActive(false);resolve(Boolean(shown));
      }
      try{
        sdk.adv.showFullscreenAdv({callbacks:{
          onOpen:()=>setAdActive(true),
          onClose:shown=>finish(shown),
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
    showRewarded,portalLanguage,language:gameLanguage};
  init();
})();
