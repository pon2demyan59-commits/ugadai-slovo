/* SDK Яндекс Игр: безопасная интеграция и реклама между раундами. */
(function () {
  "use strict";
  const host=location.hostname.toLowerCase();
  const isYandex=host==="yandex.ru" || host==="yandex.net" ||
    host.endsWith(".yandex.ru") || host.endsWith(".yandex.net");
  let sdk=null,uiReady=false,desiredGameplay=false,gameplayActive=false;
  let settleSdk;
  const whenSdk=new Promise(resolve=>{settleSdk=resolve;});
  let adActive=false,finishedRounds=0,lastAd=Date.now();
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
    finishedRounds=0;lastAd=Date.now();adActive=true;syncGameplay();
    return new Promise(resolve=>{
      let settled=false;
      function finish(shown){
        if(settled)return;settled=true;adActive=false;syncGameplay();resolve(Boolean(shown));
      }
      try{
        sdk.adv.showFullscreenAdv({callbacks:{
          onOpen:()=>{adActive=true;syncGameplay();},
          onClose:shown=>finish(shown),
          onError:error=>{console.warn("Реклама:",error);finish(false);}
        }});
      }catch(error){console.warn("Ошибка рекламы:",error);finish(false);}
    });
  }
  document.addEventListener("visibilitychange",syncGameplay);
  window.YandexPlatform={isYandex,whenSdk,ready,setGameplay,roundFinished,showInterstitialIfDue};
  init();
})();
