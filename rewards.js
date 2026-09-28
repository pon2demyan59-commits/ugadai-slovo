/* «Тайна десяти печатей»: пять частей за уровни каждой категории.
   Части вычисляются из сохранённого прохождения: старый прогресс не теряется. */
(function () {
  "use strict";
  const KEY="ugadai-slovo-profile-v1";
  const DEFAULT="Игрок";
  const NAME_RE=/^[a-zа-яё0-9 _-]+$/iu;
  function sanitize(value){
    return typeof value==="string"?value.trim().replace(/\s+/g," "):"";
  }
  function load(){
    try {
      const data=JSON.parse(localStorage.getItem(KEY)||"null")||{};
      const nickname=sanitize(data.nickname);
      return {
        nickname: nickname.length>=2&&nickname.length<=24&&NAME_RE.test(nickname)?nickname:"",
        certificateDate:typeof data.certificateDate==="string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(data.certificateDate)?data.certificateDate:""
      };
    } catch {return {nickname:"",certificateDate:""};}
  }
  let profile=load();
  function store(){
    try {localStorage.setItem(KEY,JSON.stringify(profile));}catch{}
    window.GameCloud?.schedule?.();
  }
  function getNickname(){return profile.nickname||DEFAULT;}
  function saveNickname(raw){
    const nick=sanitize(raw);
    if(nick.length<2||nick.length>24||!NAME_RE.test(nick))
      return {ok:false,message:"От 2 до 24 символов: буквы, цифры, пробел, дефис или подчёркивание."};
    profile.nickname=nick;
    store();
    return {ok:true,nickname:nick};
  }
  function completedCategories(progress,categories,maxLevel,wordsInCategory){
    return categories.filter(category=>
      Array.from({length:maxLevel},(_,index)=>index+1).every(level=>{
        const words=wordsInCategory(category.id,level);
        return words.length>0 && progress[category.id]?.[level]?.solved?.size===words.length;
      })
    );
  }
  function earnedCount(progress,categories,maxLevel,wordsInCategory){
    return completedCategories(progress,categories,maxLevel,wordsInCategory).length;
  }
  function earnedParts(progress,categories,maxLevel,wordsInCategory){
    return categories.reduce((total,category)=>total+
      Array.from({length:maxLevel},(_,index)=>index+1).filter(level=>{
        const words=wordsInCategory(category.id,level);
        return words.length>0 && progress[category.id]?.[level]?.solved?.size===words.length;
      }).length,0);
  }
  function ensureIssueDate(){
    if(!profile.certificateDate){
      const now=new Date();
      profile.certificateDate=[now.getFullYear(),
        String(now.getMonth()+1).padStart(2,"0"),
        String(now.getDate()).padStart(2,"0")].join("-");
      store();
    }
  }
  function tag(name,cls,content){
    const el=document.createElement(name);
    if(cls)el.className=cls;
    if(content!==undefined)el.textContent=String(content);
    return el;
  }
  function addPuzzle(container,progress,categories,maxLevel,wordsInCategory){
    const seals=earnedCount(progress,categories,maxLevel,wordsInCategory);
    const parts=earnedParts(progress,categories,maxLevel,wordsInCategory);
    const shell=tag("section","reward-puzzle");
    shell.append(tag("h4","reward-heading","🧩 Тайна десяти печатей"),
      tag("p","reward-description",
        "Каждый уровень раскрывает часть печати. Собери пять частей одной категории, чтобы получить целую печать. Десять печатей откроют секретную именную награду."),
      tag("p","reward-count",parts+" / 50 частей · "+seals+" / 10 печатей"));
    const grid=tag("div","reward-puzzle-grid");
    categories.forEach((cat,index)=>{
      const levels=Array.from({length:maxLevel},(_,i)=>i+1);
      const completed=levels.map(level=>{
        const words=wordsInCategory(cat.id,level);
        return words.length>0 && progress[cat.id]?.[level]?.solved?.size===words.length;
      });
      const unlocked=completed.every(Boolean);
      const piece=tag("div","reward-piece"+(unlocked?" reward-piece-unlocked":""));
      piece.setAttribute("aria-label",cat.title+": "+completed.filter(Boolean).length+" из "+maxLevel+" частей");
      piece.append(tag("span","reward-piece-icon",unlocked?cat.icon:"✦"),
        tag("small","reward-piece-label",(index+1)+". "+cat.title));
      const fragments=tag("div","reward-piece-fragments");
      completed.forEach((ready,i)=>{
        const part=tag("span","reward-fragment"+(ready?" reward-fragment-found":""),ready?"◆":"·");
        part.setAttribute("aria-label","Уровень "+(i+1)+": "+(ready?"часть найдена":"закрыт"));
        fragments.append(part);
      });
      piece.append(fragments,tag("small","reward-piece-label",
        unlocked?"Печать раскрыта":completed.filter(Boolean).length+" / "+maxLevel+" частей"));
      grid.append(piece);
    });
    shell.append(grid);
    if(seals===categories.length)shell.append(tag("p","reward-complete","Все десять печатей раскрыты! Твоя именная награда готова к печати."));
    container.append(shell);
  }
  function createCertificate(solved,wins,losses){
    const total=wins+losses;
    const percent=total?Math.round(wins/total*100):0;
    const date=profile.certificateDate
      ?new Date(profile.certificateDate+"T12:00:00").toLocaleDateString("ru-RU")
      :new Date().toLocaleDateString("ru-RU");
    const sheet=tag("article","reward-certificate");
    sheet.id="certificateSheet";
    sheet.setAttribute("aria-label","Именная грамота за полное прохождение игры");
    const top=tag("div","reward-certificate-top");
    top.append(tag("div","reward-brand-symbol","✦"),
      tag("div","reward-brand","БИНАРНЫЙ ИМПУЛЬС"),
      tag("div","reward-brand-caption","ФИРМЕННАЯ НАГРАДА ЗА ПРОХОЖДЕНИЕ ИГРЫ"));
    sheet.append(top,
      tag("p","reward-certificate-kicker","СЕРТИФИКАТ МАСТЕРА СЛОВА"),
      tag("h2","reward-certificate-title","БЛАГОДАРНОСТЬ"),
      tag("p","reward-certificate-lead","Компания «Бинарный импульс» выражает благодарность"));
    sheet.append(tag("h3","reward-certificate-name",getNickname()),
      tag("p","reward-certificate-body",
        "за упорство, сообразительность и успешное покорение всех испытаний игры «Угадай слово». " +
        "Ты разгадал все задания, раскрыл десять печатей и получил нашу секретную награду."));
    const facts=tag("div","reward-certificate-facts");
    for(const [label,value] of [["Разгадано слов",solved+"/1000"],
      ["Пройдено категорий","10/10"],["Побед в раундах",wins],
      ["Успешных раундов",percent+"%"]]){
      const item=tag("div","reward-certificate-fact");
      item.append(tag("strong","",value),tag("span","",label));
      facts.append(item);
    }
    sheet.append(facts,tag("p","reward-certificate-rank","ПОЧЁТНОЕ ЗВАНИЕ · МАСТЕР СЛОВА"));
    const foot=tag("div","reward-certificate-footer");
    const stamp=tag("div","reward-certificate-stamp");
    stamp.append(tag("span","","✦"),tag("small","","БИНАРНЫЙ\nИМПУЛЬС"));
    const dateBlock=tag("div","reward-certificate-date");
    dateBlock.append(tag("strong","",date),tag("span","","Дата выдачи"));
    foot.append(dateBlock,stamp);
    sheet.append(foot);
    return sheet;
  }
  function render(target,progress,categories,maxLevel,wordsInCategory,score){
    target.replaceChildren();
    const completed=completedCategories(progress,categories,maxLevel,wordsInCategory);
    addPuzzle(target,progress,categories,maxLevel,wordsInCategory);
    if(completed.length!==categories.length){
      target.append(tag("p","reward-locked",
        "Секретная награда откроется, когда соберёшь десять печатей и разгадаешь все 1000 заданий. " +
        "Найденные части сохраняются вместе с игровым прогрессом."));
      return;
    }
    ensureIssueDate();
    const solved=categories.reduce((sum,cat)=>sum+
      Array.from({length:maxLevel},(_,i)=>progress[cat.id][i+1].solved.size)
        .reduce((a,b)=>a+b,0),0);
    const note=tag("p","reward-personal-note",
      "Грамота оформлена на ник «"+getNickname()+"». Изменить его можно в главном меню.");
    target.append(note);
    const certificate=createCertificate(solved,score.wins,score.losses);
    target.append(certificate);
    const controls=tag("div","reward-controls");
    const print=tag("button","reward-print","🖨 Распечатать / сохранить в PDF");
    print.type="button";
    print.addEventListener("click",()=>window.print());
    controls.append(print);
    target.append(controls);
  }
  function appendProgress(target,progress,categories,maxLevel,wordsInCategory){
    const completed=completedCategories(progress,categories,maxLevel,wordsInCategory);
    addPuzzle(target,progress,categories,maxLevel,wordsInCategory);
  }
  window.GameRewards={getNickname,saveNickname,earnedCount,earnedParts,render,appendProgress,
    completedCategories,ensureIssueDate};
})();
