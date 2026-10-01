/* Сначала восстанавливаем облачный прогресс, затем запускаем игру. */
(async function(){
  "use strict";
  try { await window.GameCloud.prepare(); }
  catch(error) { console.warn("Запуск с локальным сохранением:",error); }
  const script=document.createElement("script");
  script.src="script.js?v=45";
  script.async=false;
  script.onload=()=>{
    const enter=document.querySelector("#welcomeEnter");
    if(enter)enter.disabled=false;
    window.GameCloud.schedule();
  };
  script.onerror=()=>{
    const enter=document.querySelector("#welcomeEnter");
    if(enter){enter.disabled=true;enter.textContent="Ошибка загрузки. Обновите страницу";}
  };
  document.body.append(script);
})();
