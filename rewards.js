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
    window.GameRankings?.schedule();
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
  const story=[
    "Библиотекарь спрятал послание. Каждая печать откроет новую строку. Последняя изменит всё.",
    "Первая печать снята. На обложке проступило: «Эта книга ждала не случайного гостя». ",
    "«Её страницы открываются тем, кто умеет замечать смысл в простых словах». ",
    "«Третий ключ — терпение. Иногда ответ приходит после ошибки». ",
    "«Четвёртый ключ — любопытство. За знакомыми буквами скрываются новые миры». ",
    "«Ты прошёл половину пути. Замок хранит не сокровища привычного вида». ",
    "«Имя того, кто доберётся до конца, займёт особое место в этой библиотеке». ",
    "«Осталось три печати. Послание уже узнаёт своего читателя». ",
    "«Осталось два ключа. Не позволяй последним страницам остаться непрочитанными». ",
    "«Последняя печать. Ещё один шаг — и библиотекарь исполнит своё обещание». ",
    "«Ты нашёл все ключи. Теперь последняя страница принадлежит тебе». "
  ];
  function addPuzzle(container,progress,categories,maxLevel,wordsInCategory){
    const seals=earnedCount(progress,categories,maxLevel,wordsInCategory);
    const parts=earnedParts(progress,categories,maxLevel,wordsInCategory);
    const completed=categories.map(cat=>Array.from({length:maxLevel},(_,i)=>{
      const words=wordsInCategory(cat.id,i+1);return words.length>0&&progress[cat.id]?.[i+1]?.solved?.size===words.length;
    }));
    const shell=tag("section","reward-puzzle");
    shell.append(tag("p","reward-teaser","Что скрывает последняя страница?"));
    const hero=tag("div","mystery-book"+(seals===categories.length?" mystery-ready":""));
    const image=tag("img","mystery-book-art");image.src="assets/mystery-book.webp";
    image.alt="Котёнок с ключом охраняет запечатанную книгу";hero.append(image);
    categories.forEach((cat,index)=>{
      const count=completed[index].filter(Boolean).length;
      const seal=tag("span","mystery-seal mystery-seal-"+index+(count===maxLevel?" is-open":count?" is-started":""));
      seal.setAttribute("role","img");seal.setAttribute("aria-label",cat.title+": "+count+" из "+maxLevel+" фрагментов");
      seal.title=cat.title+" · "+count+"/"+maxLevel;
      seal.append(tag("span","mystery-rune",["☀","☾","❦","△","≈","♨"," spiral ","★","♧","◇"][index].replace(" spiral ","◎")),
        tag("small","mystery-seal-state",count===maxLevel?"✓":count?count+"/5":"•"));hero.append(seal);
    });
    shell.append(hero);
    const counts=tag("div","reward-summary");
    counts.append(tag("strong","",seals+" / 10 печатей"),tag("strong","",parts+" / 50 фрагментов"));
    const track=tag("div","reward-progress");const fill=tag("span","");fill.style.width=parts/50*100+"%";track.append(fill);counts.append(track);shell.append(counts);
    const tale=tag("section","reward-story");tale.append(tag("h4","reward-heading","Послание библиотекаря"),tag("p","",story[seals]));
    if(seals>0){
      const previous=tag("details","reward-story-history");previous.append(tag("summary","","Уже раскрытые строки"));
      const list=tag("ol","");for(let i=1;i<=seals;i++)list.append(tag("li","",story[i]));previous.append(list);tale.append(previous);
    }
    shell.append(tale);
    let next=null;
    categories.forEach((cat,index)=>{
      const found=completed[index].filter(Boolean).length;
      for(let level=1;level<=maxLevel;level++){
        if(completed[index][level-1])continue;
        if(level>1&&!completed[index][level-2])break;
        const solved=progress[cat.id]?.[level]?.solved?.size||0;
        const priority=found*1000+solved;
        if(!next||priority>next.priority)next={cat,level,solved,priority};break;
      }
    });
    if(next){
      const quest=tag("section","reward-next");quest.append(tag("h4","reward-heading","Следующий фрагмент"),
        tag("p","",next.cat.title+" · уровень "+next.level+" · "+next.solved+" / "+wordsInCategory(next.cat.id,next.level).length+" слов"));
      const button=tag("button","library-action",parts?"Продолжить поиск":"Найти первый фрагмент");button.type="button";
      button.addEventListener("click",()=>document.dispatchEvent(new CustomEvent("game:continue-seal",{detail:{category:next.cat.id,level:next.level}})));
      quest.append(button);shell.append(quest);
    }
    const map=tag("details","reward-seal-map");map.append(tag("summary","","Карта десяти печатей · "+seals+" / 10"));
    const grid=tag("div","reward-puzzle-grid");
    categories.forEach((cat,index)=>{
      const count=completed[index].filter(Boolean).length,unlocked=count===maxLevel;
      const piece=tag("div","reward-piece"+(unlocked?" reward-piece-unlocked":""));
      piece.append(tag("strong","reward-piece-label",(index+1)+". "+cat.title));
      const fragments=tag("div","reward-piece-fragments");completed[index].forEach((ready,i)=>{
        const part=tag("span","reward-fragment"+(ready?" reward-fragment-found":""),ready?"◆":"·");
        part.setAttribute("aria-label","Уровень "+(i+1)+": "+(ready?"фрагмент найден":"закрыт"));fragments.append(part);
      });piece.append(fragments,tag("small","reward-piece-label",unlocked?"Печать снята":count+" / 5 фрагментов"));grid.append(piece);
    });map.append(grid);shell.append(map,tag("p","reward-description","Содержимое книги откроется только после десятой печати."));
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
        "Найденные фрагменты сохраняются. Собери все десять печатей — и узнаешь, что библиотекарь приготовил именно для тебя."));
      return;
    }
    ensureIssueDate();
    const solved=categories.reduce((sum,cat)=>sum+
      Array.from({length:maxLevel},(_,i)=>progress[cat.id][i+1].solved.size)
        .reduce((a,b)=>a+b,0),0);
    const reveal=tag("button","library-action reward-reveal","Открыть последнюю страницу");reveal.type="button";
    target.append(tag("p","reward-complete","Последняя печать снята. Книга ждёт тебя."),reveal);
    reveal.addEventListener("click",()=>{
      reveal.disabled=true;reveal.textContent="Твоя последняя страница открыта";
      target.querySelector(".mystery-book")?.classList.add("mystery-revealed");
      const note=tag("p","reward-personal-note","Эта страница посвящена «"+getNickname()+"». Изменить имя можно в главном меню.");
      const certificate=createCertificate(solved,score.wins,score.losses);
      target.append(note,certificate);
      const controls=tag("div","reward-controls");
      const print=tag("button","reward-print","Распечатать / сохранить в PDF");print.type="button";
      print.addEventListener("click",()=>window.print());controls.append(print);target.append(controls);
      certificate.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
      window.GameRankings?.flush().then(()=>window.GameRankings.flush()).then(()=>window.GameRankings.load(true)).then(({data})=>{
        if(data?.self?.completion_no&&certificate.isConnected){
          certificate.querySelector(".reward-certificate-rank").textContent="МАСТЕР СЛОВА · ПЕРВОПРОХОДЕЦ № "+data.self.completion_no;
        }
      });
    },{once:true});
  }
  function appendProgress(target,progress,categories,maxLevel,wordsInCategory){
    const completed=completedCategories(progress,categories,maxLevel,wordsInCategory);
    addPuzzle(target,progress,categories,maxLevel,wordsInCategory);
  }
  window.GameRewards={getNickname,saveNickname,earnedCount,earnedParts,render,appendProgress,
    completedCategories,ensureIssueDate,reload:()=>{profile=load();}};
})();
