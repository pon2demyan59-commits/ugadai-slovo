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
    card.append(el("span","insight-metric-icon",icon),
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
  function render(target,score,progress,categories,wordCount,maxLevel,wordsInCategory) {
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
      "Все показатели хранятся в этом браузере. Старые победы и прогресс сохранены, " +
      "но историю попыток, серии и активность за прошлые дни восстановить нельзя."));
  }
  window.GameStatsPanel={render};
})();
