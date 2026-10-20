/* VK Bridge 3.0.2. Storage привязано платформой к пользователю и приложению. */
(function(){
  "use strict";
  const params=new URLSearchParams(location.search);
  const appId=params.get("vk_app_id"),userId=params.get("vk_user_id");
  const isVK=appId==="54837354" && /^[1-9]\d*$/.test(userId||"");
  const prefix="vk_"+appId+"_"+userId+"_";
  const memory=new Map();
  // Не переносим сохранение гостя/Яндекса в случайный аккаунт VK.
  const storage={
    getItem(key){if(memory.has(key))return memory.get(key);try{return localStorage.getItem(prefix+key);}catch{return memory.get(key)||null;}},
    setItem(key,value){memory.set(key,String(value));try{localStorage.setItem(prefix+key,String(value));}catch{}},
    removeItem(key){memory.delete(key);try{localStorage.removeItem(prefix+key);}catch{}}
  };
  let bridge=null,paused=false;
  function timeout(promise,ms=6000){
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("VK: время ожидания истекло")),ms);
      Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
    });
  }
  const whenReady=(async()=>{
    if(!isVK)return false;
    try{
      bridge=window.vkBridge;
      if(!bridge)throw new Error("VK Bridge не загрузился");
      bridge.subscribe(event=>{
        const type=event.detail?.type;
        if(type!=="VKWebAppViewHide"&&type!=="VKWebAppViewRestore")return;
        paused=type==="VKWebAppViewHide";
        document.dispatchEvent(new Event(paused?"game:platform-pause":"game:platform-resume"));
        if(paused)window.GameCloud?.flush();
      });
      await timeout(bridge.send("VKWebAppInit"));
      const user=await timeout(bridge.send("VKWebAppGetUserInfo"));
      if(String(user?.id)!==userId)throw new Error("VK: аккаунт не совпадает с параметрами запуска");
      return true;
    }catch(error){console.warn("Запуск VK:",error);return false;}
  })();
  async function get(keys){
    const response=await timeout(bridge.send("VKWebAppStorageGet",{keys}));
    if(!Array.isArray(response?.keys))throw new Error("VK: некорректный ответ хранилища");
    const values=new Map(response.keys.map(item=>[item.key,item.value]));
    if(keys.some(key=>!values.has(key)||typeof values.get(key)!=="string"))throw new Error("VK: неполное чтение хранилища");
    return keys.map(key=>values.get(key));
  }
  async function set(key,value){
    const response=await timeout(bridge.send("VKWebAppStorageSet",{key,value}));
    if(response?.result!==true)throw new Error("VK не подтвердил сохранение");
  }
  function checksum(text){
    let hash=2166136261;
    for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
    return (hash>>>0).toString(16);
  }
  // Два слота: новая запись становится активной только после записи всех частей.
  // ASCII-части по 3000 байт оставляют запас к лимиту значения Storage.
  async function createPlayer(){
    if(!await whenReady)return null;
    let manifest=null,loaded=false,lastText=null;
    const slots=[null,null];
    const metaKey="ugadai_v1_meta";
    function parseMeta(raw){
      if(raw==="")return null;
      const m=JSON.parse(raw);
      if(m?.version!==1||![0,1].includes(m.slot)||!Number.isInteger(m.count)||m.count<1||m.count>128||typeof m.hash!=="string")throw new Error("VK: повреждены метаданные сохранения");
      return m;
    }
    return {
      isAuthorized:()=>true,
      async getData(keys){
        const raw=(await get([metaKey]))[0];
        manifest=parseMeta(raw);
        if(!manifest){loaded=true;return {};}
        const names=Array.from({length:manifest.count},(_,i)=>"ugadai_v1_"+manifest.slot+"_"+i);
        const parts=[];
        for(let i=0;i<names.length;i+=32)parts.push(...await get(names.slice(i,i+32)));
        const text=parts.join("");
        if(checksum(text)!==manifest.hash)throw new Error("VK: сохранение прочитано не полностью");
        const data=JSON.parse(text);
        if(data?.version!==1)throw new Error("VK: неизвестная версия сохранения");
        slots[manifest.slot]=parts;
        lastText=text;
        loaded=true;
        return {[keys[0]]:data};
      },
      async setData(data){
        if(!loaded)throw new Error("VK: сначала необходимо прочитать прогресс");
        const current=parseMeta((await get([metaKey]))[0]);
        if(JSON.stringify(current)!==JSON.stringify(manifest))throw new Error("Прогресс изменён на другом устройстве. Перезапустите игру для синхронизации.");
        const value=Object.values(data)[0];
        const text=JSON.stringify(value).replace(/[\u007f-\uffff]/g,c=>"\\u"+c.charCodeAt(0).toString(16).padStart(4,"0"));
        if(text===lastText)return;
        const count=Math.ceil(text.length/3000);
        if(count>128)throw new Error("VK: сохранение превышает допустимый размер");
        const slot=manifest?.slot===0?1:0;
        const chunks=Array.from({length:count},(_,i)=>text.slice(i*3000,(i+1)*3000));
        const next={version:1,slot,count,hash:checksum(text)};
        try{
          for(let i=0;i<count;i++)if(slots[slot]?.[i]!==chunks[i])await set("ugadai_v1_"+slot+"_"+i,chunks[i]);
          await set(metaKey,JSON.stringify(next));
        }catch(error){slots[slot]=null;throw error;}
        slots[slot]=chunks;
        lastText=text;
        manifest=next;
      }
    };
  }
  window.VKPlatform={isVK,storage:isVK?storage:null,whenReady,createPlayer,
    isYandex:false,ready(){},setGameplay(){},roundFinished(){},
    isPaused:()=>paused||document.hidden,
    showInterstitialIfDue:()=>Promise.resolve(false),showRewarded:()=>Promise.resolve(false)};
  window.GamePlatform=isVK?window.VKPlatform:window.YandexPlatform;
  if(isVK)for(const name of ["click","keydown","beforeinput","submit"]){
    document.addEventListener(name,event=>{
      if(!window.VKPlatform.isPaused())return;
      event.preventDefault();event.stopImmediatePropagation();
    },true);
  }
})();
