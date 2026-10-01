/* Общий рейтинг слов. Публичный ключ разрешает только RPC, не прямую запись таблиц. */
(function(){
  "use strict";
  const URL="https://rcttgctmieaaegdywbnz.supabase.co";
  const KEY="sb_publishable_6wPIJdK8YSke4Gx3_s0E6A_0uLmi9tP";
  let client,source,timer,busy=false,queued=false,lastSignature="",cache=null,cachedAt=0,reading=null;
  let state="idle",running=null;
  function api(){
    if(!client){
      if(!window.supabase)throw new Error("Рейтинг временно недоступен");
      client=window.supabase.createClient(URL,KEY,{auth:{storageKey:"ugadai-slovo-ranking-auth-v1",persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},
        global:{fetch:(url,options={})=>fetch(url,{...options,signal:options.signal||AbortSignal.timeout(10000)})}});
    }
    return client;
  }
  function emit(){document.dispatchEvent(new Event("game:ranking-update"));}
  async function flush(){
    if(!source)return;
    if(busy){queued=true;return running;}
    if(timer){clearTimeout(timer);timer=null;}
    const payload=source();
    if(!payload.words.length)return; // Пустые профили не создаём.
    const signature=JSON.stringify([payload.nickname,[...payload.words].sort()]);
    if(signature===lastSignature)return;
    busy=true;queued=false;state="syncing";
    running=(async()=>{
    try{
      const sb=api();const {data:{session}}=await sb.auth.getSession();
      if(!session){const {error}=await sb.auth.signInAnonymously();if(error)throw error;}
      const {error}=await sb.rpc("word_game_sync",{p_nickname:payload.nickname,p_words:payload.words});
      if(error)throw error;
      lastSignature=signature;cachedAt=0;state="ready";
    }catch(error){state="offline";console.warn("Общий рейтинг:",error.message);}
    finally{busy=false;emit();if(queued)schedule();}
    })();
    return running;
  }
  function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(flush,2500);}
  async function load(force=false){
    if(cache&&!force&&Date.now()-cachedAt<30000)return {data:cache,stale:false};
    if(reading)return reading;
    reading=(async()=>{
      try{
        const {data,error}=await api().rpc("word_game_standings");if(error)throw error;
        if(!data||!Array.isArray(data.top)||!Array.isArray(data.pioneers))throw new Error("Некорректный ответ рейтинга");
        cache=data;cachedAt=Date.now();return {data,stale:false};
      }catch(error){return {data:cache,stale:true};}
      finally{reading=null;}
    })();return reading;
  }
  function mission(finishers){
    if(!Number.isSafeInteger(finishers)||finishers<0)return "Раскрой десять печатей и впиши своё имя в историю";
    if(finishers===0)return "Стань первым, кто раскроет все 10 печатей";
    if(finishers<3)return "Войди в первую тройку первопроходцев";
    if(finishers<5)return "Войди в первую пятёрку первопроходцев";
    if(finishers<10)return "Войди в первую десятку первопроходцев";
    if(finishers<25)return "Войди в первые 25 первопроходцев";
    if(finishers<50)return "Войди в первые 50 первопроходцев";
    if(finishers<100)return "Войди в первую сотню первопроходцев";
    return "Стань первопроходцем № "+(finishers+1);
  }
  window.GameRankings={configure:fn=>{source=fn;schedule();},schedule,flush,load,mission,getState:()=>state};
  addEventListener("online",()=>{schedule();cachedAt=0;emit();});
})();
