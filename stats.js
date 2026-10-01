/* Расширенная локальная статистика; старый счёт побед хранится отдельно. */
(function () {
  "use strict";
  const KEY = "ugadai-slovo-stats-v1";
  const empty = () => ({ distribution:[0,0,0,0,0,0], streak:0, bestStreak:0,
    recentDays:{}, lastWinDay:null, consecutiveDays:0, bestDays:0, totalDetailed:0 });
  function load() {
    try {
      const raw=JSON.parse(localStorage.getItem(KEY)||"null");
      if (!raw || typeof raw!=="object") return empty();
      const result=empty();
      for(const field of ["streak","bestStreak","consecutiveDays","bestDays","totalDetailed"]) {
        if(Number.isSafeInteger(raw[field]) && raw[field]>=0) result[field]=raw[field];
      }
      if(Array.isArray(raw.distribution)){
        result.distribution=result.distribution.map((_,i)=>
          Number.isSafeInteger(raw.distribution[i]) && raw.distribution[i]>=0 ? raw.distribution[i] : 0);
        // В прежней версии индекс 4 означал последний шанс.
        if(raw.distribution.length===5){result.distribution[5]=result.distribution[4];result.distribution[4]=0;}
      }
      if(raw.recentDays && typeof raw.recentDays==="object") {
        for(const [day,count] of Object.entries(raw.recentDays)) {
          if(/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isSafeInteger(count) && count>=0)
            result.recentDays[day]=count;
        }
      }
      if(typeof raw.lastWinDay==="string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastWinDay))
        result.lastWinDay=raw.lastWinDay;
      return result;
    } catch { return empty(); }
  }
  let data=load();
  function localDay(date=new Date()) {
    return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
  }
  function previousDay(day) {
    const [year,month,date]=day.split("-").map(Number);
    return localDay(new Date(year,month-1,date-1));
  }
  function record(won,attempts,finalChance) {
    data.totalDetailed++;
    if(won) {
      data.streak++;
      data.bestStreak=Math.max(data.bestStreak,data.streak);
      const bucket=finalChance ? 5 : Math.max(0,Math.min(4,attempts-1));
      data.distribution[bucket]++;
      const today=localDay();
      data.recentDays[today]=(data.recentDays[today]||0)+1;
      if(data.lastWinDay!==today) {
        data.consecutiveDays=data.lastWinDay===previousDay(today)?data.consecutiveDays+1:1;
        data.bestDays=Math.max(data.bestDays,data.consecutiveDays);
        data.lastWinDay=today;
      }
    } else data.streak=0;
    const cutoff=new Date();cutoff.setDate(cutoff.getDate()-90);
    const cutoffDay=localDay(cutoff);
    Object.keys(data.recentDays).forEach(day=>{if(day<cutoffDay)delete data.recentDays[day];});
    try {localStorage.setItem(KEY,JSON.stringify(data));} catch {}
  }
  function snapshot() {
    const today=localDay();
    return {...data,streak:data.streak,
      consecutiveDays:data.lastWinDay===today||data.lastWinDay===previousDay(today)?data.consecutiveDays:0,
      distribution:[...data.distribution],recentDays:{...data.recentDays}};
  }
  window.GameStats={record,snapshot,localDay,reload:()=>{data=load();}};
})();

/* Экран статистики без сторонних библиотек, полностью адаптивный. */
(function () {
  "use strict";
  function el(tag,cls,text) {
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=String(text);
    return node;
  }
  function section(parent,title,subtitle) {
    const block=el("section","insight-section");
    block.append(el("h4","insight-heading",title));
    if(subtitle)block.append(el("p","insight-note",subtitle));
    parent.append(block);
    return block;
  }
  function metric(parent,icon,label,value) {
    const card=el("div","insight-metric");
    const symbol=el("span","insight-metric-icon");symbol.setAttribute("aria-hidden","true");
    const shapes={
      "📚":"<path d='M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3zM12 6v16M6 8h3M6 12h3M15 8h3M15 12h3'/>",
      "🔥":"<rect x='3' y='5' width='18' height='16' rx='2'/><path d='M7 3v4M17 3v4M3 10h18M7 14h2M15 14h2M7 18h2'/>",
      "★":"<path d='m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z'/>",
      "🏆":"<path d='M7 3h10v7a5 5 0 0 1-10 0zM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4M12 15v6M8 21h8'/>",
      "🎯":"<circle cx='12' cy='12' r='9'/><circle cx='12' cy='12' r='5'/><circle cx='12' cy='12' r='1'/>"
    };
    symbol.innerHTML="<svg viewBox='0 0 24 24'>"+(shapes[icon]||shapes["★"])+"</svg>";
    card.append(symbol,
      el("strong","insight-metric-value",value),el("span","insight-metric-label",label));
    parent.append(card);
  }
  function bar(parent,label,count,total,caption) {
    const row=el("div","insight-bar-row");
    const header=el("div","insight-bar-label");
    header.append(el("span","",label),el("strong","",caption||String(count)));
    const track=el("div","insight-bar-track");
    const fill=el("div","insight-bar-fill");
    fill.style.width=(total?Math.min(100,count/total*100):0)+"%";
    track.append(fill);row.append(header,track);parent.append(row);
  }
  function renderDetails(target,score,progress,categories,wordCount,maxLevel,wordsInCategory) {
    const data=window.GameStats.snapshot(),rounds=score.wins+score.losses;
    const solved=categories.reduce((sum,c)=>
      sum+Array.from({length:maxLevel},(_,i)=>progress[c.id][i+1].solved.size)
        .reduce((a,b)=>a+b,0),0);
    const rate=rounds?Math.round(score.wins/rounds*100):0;
    const detailWins=data.distribution.reduce((a,b)=>a+b,0);
    target.replaceChildren();
    target.append(el("p","insight-intro","Твой путь к званию мастера слов"));
    const overview=el("div","insight-metrics");
    metric(overview,"🏆","Победы",score.wins);
    metric(overview,"🎯","Процент побед",rate+"%");
    metric(overview,"🔥","Лучшая серия",data.bestStreak||"—");
    metric(overview,"📚","Слов разгадано",solved+"/"+wordCount);
    target.append(overview);
    const total=section(target,"Общие результаты");
    const tally=el("div","insight-tally");
    for(const [label,value] of [["Сыграно раундов",rounds],["Поражения",score.losses],
      ["Текущая серия",data.streak],["Дней подряд",data.consecutiveDays]]) {
      const row=el("div","insight-tally-line");
      row.append(el("span","",label),el("strong","",value));tally.append(row);
    }
    total.append(tally);
    const distribution=section(target,"С какой попытки угадываешь",
      "Подробные данные собираются с этого обновления. Последний шанс учитывается отдельно.");
    const names=["С первой попытки","Со второй","С третьей","С четвёртой","С пятой (бонус)","Последний шанс"];
    for(let i=0;i<6;i++)bar(distribution,names[i],data.distribution[i],Math.max(1,...data.distribution));
    const regular=data.distribution.slice(0,5).reduce((sum,n,i)=>sum+n*(i+1),0);
    const regularCount=detailWins-data.distribution[5];
    distribution.append(el("p","insight-note",regularCount
      ?"Среднее число попыток (без последнего шанса): "+(regular/regularCount).toFixed(1)
      :"Первые результаты появятся после новой победы."));
    const categoriesBlock=section(target,"Прогресс по категориям",
      "Каждая категория состоит из пяти уровней.");
    for(const c of categories) {
      const totalSolved=Array.from({length:maxLevel},(_,i)=>progress[c.id][i+1].solved.size)
        .reduce((a,b)=>a+b,0);
      const totalWords=Array.from({length:maxLevel},(_,i)=>wordsInCategory(c.id,i+1).length)
        .reduce((a,b)=>a+b,0);
      const details=el("details","insight-category");
      const summary=el("summary","insight-category-title",c.icon+" "+c.title+" · "+totalSolved+"/"+totalWords);
      details.append(summary);
      bar(details,"Всего",totalSolved,totalWords,totalSolved+"/"+totalWords);
      for(let level=1;level<=maxLevel;level++) {
        const count=progress[c.id][level].solved.size,limit=wordsInCategory(c.id,level).length;
        bar(details,"Уровень "+level,count,limit,count+"/"+limit);
      }
      categoriesBlock.append(details);
    }
    const achievements=section(target,"Достижения");
    const awards=[
      ["🥇","Первое слово","Одержать первую победу",score.wins>=1],
      ["🔥","Без ошибок","10 побед подряд",data.bestStreak>=10],
      ["📚","Эрудит","Разгадать 500 разных слов",solved>=500],
      ["👑","Легенда","Разгадать все слова",solved>=wordCount],
      ["🌞","Постоянство","Играть с победой 7 дней подряд",data.bestDays>=7],
      ["⚡","С первого раза","Угадать 10 слов с первой попытки",data.distribution[0]>=10]
    ];
    const awardGrid=el("div","insight-awards");
    for(const [icon,name,goal,done] of awards) {
      const card=el("div","insight-award"+(done?" unlocked":""));
      card.append(el("span","insight-award-icon",done?icon:"🔒"),
        el("strong","",name),el("small","",goal),
        el("span","insight-award-state",done?"Получено":"Не открыто"));
      awardGrid.append(card);
    }
    achievements.append(awardGrid);
    const activity=section(target,"Последние 7 дней","Победы по дням с момента обновления.");
    const days=el("div","insight-days");
    const today=new Date();
    for(let offset=6;offset>=0;offset--) {
      const date=new Date(today.getFullYear(),today.getMonth(),today.getDate()-offset);
      const key=window.GameStats.localDay(date),count=data.recentDays[key]||0;
      const day=el("div","insight-day");
      const value=el("strong","insight-day-value",count);
      const height=count?Math.max(12,Math.min(80,count*8))+"px":"4px";
      const column=el("div","insight-day-column");column.style.height=height;
      day.append(value,column,el("span","",date.toLocaleDateString("ru-RU",{weekday:"short"})));
      days.append(day);
    }
    activity.append(days);
    target.append(el("p","insight-footnote",
      "Подробная статистика хранится на устройстве и в облаке после входа через Яндекс. В общий рейтинг отправляются ник и разные разгаданные слова. Старый прогресс сохранён, " +
      "но историю попыток, серии и активность за прошлые дни восстановить нельзя."));
  }
  function playButton(label){
    const button=el("button","library-action",label);button.type="button";
    button.addEventListener("click",()=>document.dispatchEvent(new Event("game:choose-category")));return button;
  }
  function rankRow(entry,pioneer=false){
    const row=el("li","leader-row"+(entry.is_me?" leader-me":""));
    const rank=pioneer?entry.completion_no:entry.rank;
    row.append(el("span","leader-medal leader-medal-"+rank,rank));
    const info=el("span","leader-player");
    info.append(el("strong","",entry.nickname+(entry.is_me?" · ты":"")));
    if(pioneer)info.append(el("small","",new Date(entry.completed_at).toLocaleDateString("ru-RU")));
    else info.append(el("small","",entry.seals+" / 10 печатей"));
    row.append(info,el("strong","leader-score",pioneer?"1 000 / 1 000":entry.solved+" / 1 000"));return row;
  }
  async function renderRanking(target,pioneer,solved){
    target.replaceChildren(el("p","insight-note","Загружаем общий рейтинг…"));
    const {data,stale}=await window.GameRankings.load();
    if(!target.isConnected)return;
    target.replaceChildren();
    const block=section(target,pioneer?"ЗАЛ ПЕРВОПРОХОДЦЕВ":"ТОП 10 МАСТЕРОВ",
      pioneer?"Твой номер за полное прохождение останется в истории навсегда.":"Выше тот, кто разгадал больше разных слов. При равенстве — кто достиг результата раньше.");
    if(!data){
      block.append(el("p","leader-empty","Не удалось загрузить рейтинг. Твой прогресс сохранён — попробуй снова, когда появится сеть."));
      const retry=el("button","library-action","Обновить рейтинг");retry.type="button";
      retry.addEventListener("click",()=>{window.GameRankings.load(true).then(()=>renderRanking(target,pioneer,solved));});block.append(retry);return;
    }
    if(stale)block.append(el("p","insight-note","Показан сохранённый рейтинг. Обновим, когда появится сеть."));
    const list=el("ol","leader-list");
    const entries=pioneer?data.pioneers:data.top;
    for(const entry of entries)list.append(rankRow(entry,pioneer));
    block.append(list);
    if(!entries.length){
      if(pioneer)block.append(el("div","pioneer-throne","♛"),el("p","leader-empty","Полное прохождение ещё никто не зарегистрировал."));
      else{
        const places=el("div","leader-vacant");for(let i=1;i<=10;i++)places.append(el("span","leader-slot",i));
        block.append(places,el("p","leader-empty","Здесь появятся первые игроки. Разгадай слово и займи своё место!"));
      }
    }
    if(data.self){
      const own=el("div","leader-own");
      own.append(el("strong","",pioneer
        ?data.self.completion_no?"Ты — первопроходец № "+data.self.completion_no:"Твоё прохождение: "+data.self.solved+" / 1 000"
        :"Твоё место: № "+data.self.rank),el("span","",data.self.nickname));
      block.append(own);
      if(!pioneer&&data.self.rank>10&&data.cutoff!=null){
        const left=Math.max(1,data.cutoff-data.self.solved+1);
        block.append(el("p","leader-motivation",left<=1000-data.self.solved
          ?"До топа осталось разгадать ещё "+left+" разных слов."
          :"Лидеры уже разгадали все слова. Заверши свой путь и получи постоянный номер первопроходца."));
      }
    }else block.append(el("p","insight-note",solved?"Отправляем твой прогресс в общий рейтинг…":"Твой результат появится после первой победы."));
    if(window.GameRankings.getState()==="offline")block.append(el("p","insight-note","Результат пока не отправлен. Он сохранён на устройстве и отправится при подключении."));
    block.append(el("p","insight-note","Твой профиль рейтинга сохранён в этом браузере."));
    const goal=section(target,pioneer?"ТВОЯ СТРАНИЦА В ИСТОРИИ":"ЗАЛ ПЕРВОПРОХОДЦЕВ");
    goal.classList.add("pioneer-invitation");
    goal.append(el("div","pioneer-crown","♛"),el("strong","leader-motivation",data.self?.completion_no
      ?"Твоё имя уже в истории: первопроходец № "+data.self.completion_no
      :window.GameRankings.mission(data.finishers)),el("p","insight-note",data.finishers+" игроков завершили путь · 1 000 заданий · 10 печатей"),playButton(solved?"Продолжить путь":"Начать путь"));
  }
  function render(target,score,progress,categories,wordCount,maxLevel,wordsInCategory){
    const data=window.GameStats.snapshot();
    const solved=categories.reduce((sum,c)=>sum+Array.from({length:maxLevel},(_,i)=>progress[c.id][i+1].solved.size).reduce((a,b)=>a+b,0),0);
    target.replaceChildren();
    const overview=el("div","insight-metrics");
    metric(overview,"📚","Слов разгадано",solved+" / "+wordCount);
    metric(overview,"🔥","Дней подряд",data.consecutiveDays);
    metric(overview,"★","Лучшая серия",data.bestStreak);
    metric(overview,"🏆","Победы",score.wins);
    target.append(overview);
    const path=section(target,"Путь к мастеру слова");bar(path,"Разгадано разных слов",solved,wordCount,Math.round(solved/wordCount*100)+"%");
    path.append(el("p","insight-note",data.lastWinDay===window.GameStats.localDay()
      ?"Сегодня победа уже есть. Вернись завтра, чтобы продолжить серию дней."
      :"Разгадай хотя бы одно слово сегодня, чтобы продолжить серию дней."));
    const tabs=el("div","insight-tabs");tabs.setAttribute("role","tablist");tabs.setAttribute("aria-label","Статистика и рейтинги");
    const panel=el("div","insight-tab-panel");panel.id="statisticsTabPanel";panel.setAttribute("role","tabpanel");
    let active="personal";
    const draw=()=>{
      if(active==="personal"){
        renderDetails(panel,score,progress,categories,wordCount,maxLevel,wordsInCategory);
        panel.querySelector(".insight-intro")?.remove();panel.querySelector(".insight-metrics")?.remove();
      }else {panel.replaceChildren();const content=el("div","");panel.append(content);renderRanking(content,active==="pioneers",solved);}
    };
    const buttons=[];
    for(const [key,label] of [["personal","Мои успехи"],["top","Топ 10"],["pioneers","Первопроходцы"]]){
      const button=el("button","insight-tab",label);button.type="button";button.id="stats-tab-"+key;
      button.setAttribute("role","tab");button.setAttribute("aria-controls",panel.id);button.setAttribute("aria-selected",String(key===active));
      button.tabIndex=key===active?0:-1;
      button.addEventListener("click",()=>{active=key;for(const b of buttons){b.setAttribute("aria-selected",String(b===button));b.tabIndex=b===button?0:-1;}panel.setAttribute("aria-labelledby",button.id);draw();});
      buttons.push(button);tabs.append(button);
    }
    tabs.addEventListener("keydown",event=>{let i=buttons.indexOf(document.activeElement);if(i<0)return;
      if(event.key==="ArrowRight")i=(i+1)%3;else if(event.key==="ArrowLeft")i=(i+2)%3;else return;
      event.preventDefault();buttons[i].click();buttons[i].focus();});
    panel.setAttribute("aria-labelledby",buttons[0].id);target.append(tabs,panel);draw();
    const onUpdate=()=>{if(!panel.isConnected||target.closest("#menuDetails").hidden){document.removeEventListener("game:ranking-update",onUpdate);return;}if(active!=="personal")draw();};
    document.addEventListener("game:ranking-update",onUpdate);
    window.GameRankings.flush();
  }

  window.GameStatsPanel={render};
})();
