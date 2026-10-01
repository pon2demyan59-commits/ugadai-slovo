/* Ретро-аркадный синтезатор: весь звук генерируется Web Audio API.
   Никаких аудиофайлов, сторонних сервисов и фонового запуска без жеста игрока. */
(function(){
  "use strict";
  const KEY="ugadai-slovo-audio-v1";
  const DEFAULTS={music:true,effects:true};
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  let settings={...DEFAULTS},ctx=null,master=null,musicBus=null,effectsBus=null;
  let unlocked=false,scene="welcome",inAd=false,platformPaused=false,windowBlurred=false,sequence=0,ticker=null;
  let melodyUntil=0;
  try{
    const saved=JSON.parse(localStorage.getItem(KEY)||"null");
    if(saved&&typeof saved==="object"){
      settings.music=saved.music!==false;
      settings.effects=saved.effects!==false;
    }
  }catch{}
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{}
  }
  function ensureContext(){
    if(!AudioContextClass)return false;
    if(ctx)return true;
    try{
      ctx=new AudioContextClass();
      master=ctx.createGain();master.gain.value=.68;master.connect(ctx.destination);
      musicBus=ctx.createGain();musicBus.gain.value=.21;musicBus.connect(master);
      effectsBus=ctx.createGain();effectsBus.gain.value=.44;effectsBus.connect(master);
      return true;
    }catch(error){console.warn("Игровой звук:",error);return false;}
  }
  function audible(){return unlocked&&!document.hidden&&!inAd&&!platformPaused&&!windowBlurred;}
  function unlock(){
    if(!ensureContext())return false;
    unlocked=true;
    if(audible()&&ctx.state==="suspended")ctx.resume().catch(()=>{});
    startMusic();
    return true;
  }
  // Синтезируем одну ноту с мягким затуханием, без щелчков от резкого обрыва.
  function tone(frequency,duration,kind,when=0,wave="square",volume=.16){
    if(!ctx||!audible()||!settings[kind]||frequency<=0)return;
    const start=ctx.currentTime+when;
    const osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type=wave;
    osc.frequency.setValueAtTime(frequency,start);
    gain.gain.setValueAtTime(.0001,start);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),start+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    osc.connect(gain);gain.connect(kind==="music"?musicBus:effectsBus);
    osc.start(start);osc.stop(start+duration+.025);
  }
  const NOTES={
    C4:261.63,D4:293.66,E4:329.63,F4:349.23,G4:392,
    A4:440,B4:493.88,C5:523.25,D5:587.33,E5:659.25,
    F5:698.46,G5:783.99,A5:880,B5:987.77,C6:1046.5
  };
  // 32-шагая чиптюн-петля. Паузы и смена октав предотвращают монотонный писк.
  const LOOP=[
    "E5",null,"G5","E5","C5",null,"G4",null,
    "D5",null,"F5","D5","B4",null,"G4",null,
    "C5","E5","G5",null,"E5",null,"C5",null,
    "A4",null,"D5","F5","E5",null,"G4",null
  ];
  function canMusic(){
    return audible()&&settings.music&&(scene==="home"||scene==="game");
  }
  function musicStep(){
    if(!canMusic()||!ctx||ctx.state!=="running"||ctx.currentTime<melodyUntil)return;
    const step=sequence++%LOOP.length;
    const name=LOOP[step];
    if(name)tone(NOTES[name],.115,"music",0,"triangle",.105);
    if(step%4===0)tone(step<16?130.81:146.83,.18,"music",0,"square",.045);
  }
  function startMusic(){
    if(!ticker)ticker=setInterval(musicStep,220);
  }
  function pauseForAd(active){
    inAd=Boolean(active);
    if(!ctx)return;
    if(!audible()){
      ctx.suspend().catch(()=>{});
    }else if(audible()&&ctx.state==="suspended"){
      ctx.resume().catch(()=>{});
    }
  }
  const SOUND={
    key:()=>tone(523.25,.055,"effects",0,"square",.085),
    erase:()=>tone(275,.09,"effects",0,"triangle",.1),
    check:()=>{tone(390,.08,"effects",0,"square",.1);tone(520,.1,"effects",.09,"square",.085);},
    correct:()=>{tone(659.25,.1,"effects",0,"triangle",.17);tone(987.77,.15,"effects",.10,"triangle",.13);},
    wrong:()=>{tone(220,.15,"effects",0,"sawtooth",.1);tone(174.61,.2,"effects",.13,"triangle",.08);},
    hint:()=>[523.25,659.25,783.99].forEach((n,i)=>tone(n,.15,"effects",i*.085,"triangle",.14)),
    puzzle:()=>[523.25,659.25,783.99,1046.5].forEach((n,i)=>tone(n,.23,"effects",i*.12,"square",.12)),
    win:()=>[392,523.25,659.25,783.99,1046.5].forEach((n,i)=>tone(n,i===4?.55:.17,"effects",i*.125,"square",.13))
  };
  function play(name){
    if(!audible()||!settings.effects||!SOUND[name])return;
    if(name==="win"||name==="puzzle")melodyUntil=ctx.currentTime+1.3;
    SOUND[name]();
  }
  function setScene(next){
    scene=next;
    if(scene==="welcome")sequence=0;
    if(unlocked&&canMusic()&&ctx?.state==="suspended")ctx.resume().catch(()=>{});
  }
  function syncButtons(){
    for(const button of document.querySelectorAll("[data-audio]")){
      const kind=button.dataset.audio,enabled=settings[kind];
      button.setAttribute("aria-pressed",String(enabled));
      button.textContent=(kind==="music"?"♫ Музыка: ":"♪ Звуки: ")+(enabled?"ВКЛ":"ВЫКЛ");
      button.title=enabled?"Выключить "+(kind==="music"?"музыку":"звуковые эффекты"):
        "Включить "+(kind==="music"?"музыку":"звуковые эффекты");
    }
  }
  function toggle(kind){
    if(!(kind in settings))return;
    settings[kind]=!settings[kind];save();syncButtons();
    unlock();
    // Явное включение звуков подтверждаем коротким сигналом.
    if(kind==="effects"&&settings.effects)play("key");
  }
  document.addEventListener("click",event=>{
    const button=event.target.closest?.("[data-audio]");
    if(button)toggle(button.dataset.audio);
  });
  // Только реальное действие пользователя разблокирует WebAudio.
  document.addEventListener("pointerdown",unlock,{once:true,capture:true});
  document.addEventListener("keydown",unlock,{once:true,capture:true});
  document.addEventListener("visibilitychange",()=>{
    if(!ctx)return;
    if(document.hidden)ctx.suspend().catch(()=>{});
    else if(audible())ctx.resume().catch(()=>{});
  });
  document.addEventListener("game:ad-start",()=>pauseForAd(true));
  document.addEventListener("game:ad-end",()=>pauseForAd(false));
  document.addEventListener("game:platform-pause",()=>{platformPaused=true;pauseForAd(inAd);});
  document.addEventListener("game:platform-resume",()=>{platformPaused=false;pauseForAd(inAd);});
  window.addEventListener?.("blur",()=>{windowBlurred=true;pauseForAd(inAd);});
  window.addEventListener?.("focus",()=>{windowBlurred=false;pauseForAd(inAd);});
  syncButtons();
  window.GameAudio={play,setScene,toggle,getSettings:()=>({...settings}),unlock};
})();
