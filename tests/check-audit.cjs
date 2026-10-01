// Regression scenarios found during the October audit. No browser dependencies.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
class Node {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.value='';this.hidden=false;this.dataset={};this.events={};this.style={setProperty(){}};this.classes=new Set();this.classList={add:(...v)=>v.forEach(x=>this.classes.add(x)),remove:(...v)=>v.forEach(x=>this.classes.delete(x)),contains:x=>this.classes.has(x),toggle:(x,b)=>b?this.classes.add(x):this.classes.delete(x)};}
  append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
  prepend(n){n.parent=this;this.children.unshift(n);}
  replaceChildren(...n){this.children=[];this.append(...n);}
  get firstElementChild(){return this.children[0];}
  setAttribute(k,v){this[k]=String(v);}
  addEventListener(k,fn){(this.events[k]??=[]).push(fn);}
  dispatchEvent(e){for(const fn of this.events[e.type]||[])fn(e);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
  focus(){} setSelectionRange(){} close(){this.open=false;} showModal(){this.open=true;}
  querySelector(){return new Node();} querySelectorAll(){return [];}
}
function game(saved=new Map()){
 const nodes=new Map();const doc=new Node();doc.querySelector=s=>{if(!nodes.has(s))nodes.set(s,new Node());return nodes.get(s);};doc.createElement=t=>new Node(t);doc.body=new Node();doc.querySelectorAll=()=>[];
 const localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 const ctx={document:doc,localStorage,console,Date,setTimeout,clearTimeout,Event:class{constructor(type){this.type=type;}},CustomEvent:class{},VALID_LONG_WORDS:new Set(),longDictionaryReady:true,location:{},window:{addEventListener(){},matchMedia:()=>({matches:true}),GameCloud:{schedule(){},flush(){}},YandexPlatform:{setGameplay(){},roundFinished(){},isYandex:false},GameRankings:{configure(){},schedule(){}}}};
 vm.createContext(ctx);for(const n of ['data/words.js',...['animals','nature','food','home','city','tech','slang','cinema','sport','travel'].map(x=>'data/levels/'+x+'.js'),'data/valid-words.js','hints.js','stats.js','rewards.js','script.js'])vm.runInContext(read(n),ctx,{filename:n});
 return {ctx,saved,nodes,run:code=>vm.runInContext(code,ctx)};
}
async function main(){
 const g=game();assert.equal(g.run('currentWord'),'','Opening the welcome screen must not start a hidden round');
 g.run('startLevel("animals",1)');g.run('revealAutomatic("first",0)');
 // Exercise extra attempt, keyboard elimination and clue, then reconstruct the entire game.
 g.nodes.get('#hintAttempt').dispatchEvent({type:'click'});g.nodes.get('#hintEliminate').dispatchEvent({type:'click'});g.nodes.get('#hintClue').dispatchEvent({type:'click'});
 const original=g.run('JSON.stringify(roundHints)');const stock=g.run('JSON.stringify(window.GameHints.balances())');const word=g.run('currentWord');
 const resumed=game(g.saved);resumed.run('startLevel("animals",1)');
 assert.equal(resumed.run('currentWord'),word);assert.equal(resumed.run('JSON.stringify(roundHints)'),original,'Spent round hints must survive reload');assert.equal(resumed.run('roundAttemptLimit'),5);assert.equal(resumed.run('revealed[0]'),true);assert.equal(resumed.run('JSON.stringify(window.GameHints.balances())'),stock,'Restoration must not spend hints a second time');
 resumed.run('checkGuess("абвгд");checkGuess("абвгд")');assert.equal(resumed.run('currentAttempt'),0,'Repeated click cannot bypass dictionary');
 resumed.run('checkGuess(wordBank.find(w=>w!==currentWord))');assert.equal(resumed.run('currentAttempt'),1);
 // Complete every level through the actual gameplay functions, including animation microtasks.
 const all=game();const cats=all.run('GAME_CATEGORIES.map(c=>c.id)');
 for(const cat of cats)for(let level=1;level<=5;level++){
  all.run(`startLevel(${JSON.stringify(cat)},${level})`);
  for(let n=0;n<20;n++){
   all.run('checkGuess(currentWord)');await Promise.resolve();await Promise.resolve();
   assert.equal(all.run('phase'),'finished');if(n<19)all.run('startGame()');
  }
  assert.equal(all.run(`allProgress[${JSON.stringify(cat)}][${level}].solved.size`),20);
 }
 assert.equal(all.run('window.GameRewards.earnedCount(allProgress,GAME_CATEGORIES,MAX_LEVEL,wordsInCategory)'),10);
 const before=all.run('JSON.stringify([...allProgress.animals[1].solved])');all.run('startLevel("animals",1)');assert.equal(all.run('replayMode'),true);all.run('checkGuess(currentWord)');await Promise.resolve();await Promise.resolve();assert.equal(all.run('replaySolved.size'),1);assert.equal(all.run('JSON.stringify([...allProgress.animals[1].solved])'),before);
 // Corrupt completion flags cannot unlock content or give seals.
 const bad=new Map([['ugadai-slovo-category-level-progress-v3',JSON.stringify({animals:{1:{completed:true,solved:[]}}})]]);const damaged=game(bad);assert.equal(damaged.run('levelUnlocked("animals",2)'),false);
 game(new Map([['ugadai-slovo-category-progress-v2','null']]));
 // Profile reload after cloud restore.
 g.saved.set('ugadai-slovo-profile-v1',JSON.stringify({nickname:'Дамиан',certificateDate:'2026-10-01'}));g.ctx.window.GameRewards.reload();assert.equal(g.ctx.window.GameRewards.getNickname(),'Дамиан');
 console.log('OK: full 1000-word progression, 50 fragments, 10 seals, replay, hints after reload, cloud nickname and invalid saves.');
 // Check bridge with realistic callback ordering and overlapping reasons for pause.
 const listeners={},events={},doc=new Node();doc.hidden=false;doc.documentElement={};doc.head={append:s=>s.onload()};doc.createElement=()=>({});let ready=0,starts=0,stops=0,rv;
 const sdk={on:(n,fn)=>listeners[n]=fn,environment:{i18n:{lang:'ru'}},features:{LoadingAPI:{ready:()=>ready++},GameplayAPI:{start:()=>starts++,stop:()=>stops++}},adv:{showRewardedVideo:({callbacks})=>rv=callbacks}};
 const ctx={window:{YaGames:{init:async()=>sdk},addEventListener:(n,fn)=>events[n]=fn},document:doc,location:{hostname:'games.yandex.ru'},console,Date,Promise,Event:class{constructor(type){this.type=type;}}};vm.createContext(ctx);vm.runInContext(read('yandex-platform.js'),ctx);const p=ctx.window.YandexPlatform;await p.whenSdk;
 p.ready();p.ready();assert.equal(ready,1);p.setGameplay(true);assert.equal(starts,1);listeners.game_api_pause();assert(p.isPaused());assert.equal(stops,1);
 const reward=p.showRewarded();rv.onRewarded();rv.onClose();assert.equal(await reward,true);assert(p.isPaused(),'Closing an ad must not clear another platform pause');listeners.game_api_resume();assert.equal(starts,2);
 events.blur();assert(p.isPaused());events.focus();assert(!p.isPaused());p.setGameplay(false);const count=starts;listeners.game_api_pause();listeners.game_api_resume();assert.equal(starts,count,'Resume in a menu must not start gameplay');
 console.log('OK: ready once, platform pause, overlapping ad pause, focus loss and resume in menu.');
 // Latest hint snapshot wins, so cloud loading does not resurrect spent hints.
 const cloud=read('cloud-save.js');const merge=cloud.slice(cloud.indexOf('  function mergeHints('),cloud.indexOf('  function snapshot('));
 const c={};vm.createContext(c);vm.runInContext('function nonnegative(n){return Number.isSafeInteger(n)&&n>=0?n:0;}function arrayUnion(a,b){return [...new Set([...(a||[]),...(b||[])])];}'+merge,c);
 const balance=(amount,updatedAt)=>({version:1,balances:{letter:amount},rewardedWins:0,rewardedLevels:[],updatedAt});assert.equal(c.mergeHints(balance(8,10),balance(3,20)).balances.letter,3);assert.equal(c.mergeHints(balance(2,30),balance(8,20)).balances.letter,2);
 console.log('OK: latest cloud hint balance, without returning spent boosters.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
