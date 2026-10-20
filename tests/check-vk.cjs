const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
function environment({user='42',actualUser=user,remote=new Map(),local=new Map(),search,fail}={}){
  let listener;
  const writes=[];
  const ctx={URLSearchParams,Map,Promise,JSON,Math,Event,console:{warn(){}},
    setTimeout:(fn,ms)=>{const timer=setTimeout(fn,ms);timer.unref();return timer;},clearTimeout,
    location:{search:search??'?vk_app_id=54837354&vk_user_id='+user},
    document:{hidden:false,dispatchEvent(){},addEventListener(){}},
    localStorage:{getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},
    window:{YandexPlatform:{isYandex:false},vkBridge:{subscribe:fn=>listener=fn,async send(method,args){
      if(fail?.(method,args))throw new Error('network failure');
      if(method==='VKWebAppInit')return {result:true};
      if(method==='VKWebAppGetUserInfo')return {id:Number(actualUser)};
      if(method==='VKWebAppStorageGet')return {keys:args.keys.map(key=>({key,value:remote.get(key)??''}))};
      if(method==='VKWebAppStorageSet'){
        assert(Buffer.byteLength(args.value)<=4096,'Storage value exceeds limit');
        writes.push(args.key);remote.set(args.key,args.value);return {result:true};
      }
      throw new Error('unexpected '+method);
    }}}};
  vm.createContext(ctx);vm.runInContext(read('vk-platform.js'),ctx);
  return {ctx,platform:ctx.window.VKPlatform,remote,local,writes,event:type=>listener({detail:{type}})};
}
async function main(){
  const normal=environment({search:''});assert(!normal.platform.isVK);assert.equal(await normal.platform.createPlayer(),null);
  assert.equal(normal.ctx.window.GamePlatform,normal.ctx.window.YandexPlatform);
  const shared=new Map([['ugadai-slovo-score-v1','guest']]);
  const a=environment({local:shared}),b=environment({local:shared,user:'43'});
  a.platform.storage.setItem('score','a');b.platform.storage.setItem('score','b');
  assert.equal(a.platform.storage.getItem('score'),'a');assert.equal(b.platform.storage.getItem('score'),'b');
  assert.equal(a.platform.storage.getItem('ugadai-slovo-score-v1'),null,'Guest data must not leak into VK');
  assert.equal(await environment({actualUser:'43'}).platform.createPlayer(),null,'Mismatched identity must fail closed');
  const offline=environment({fail:m=>m==='VKWebAppInit'});assert.equal(await offline.platform.createPlayer(),null);
  await a.platform.whenReady;a.event('VKWebAppViewHide');assert(a.platform.isPaused());a.event('VKWebAppViewRestore');assert(!a.platform.isPaused());

  // A real full-game save, including all Cyrillic answers and unfinished round.
  const bank={};vm.createContext(bank);
  for(const file of ['data/words.js',...['animals','nature','food','home','city','tech','slang','cinema','sport','travel'].map(c=>'data/levels/'+c+'.js')])vm.runInContext(read(file),bank);
  const words=vm.runInContext('GAME_WORDS',bank),progress={};
  for(const word of words){
    progress[word.category]??={};
    const level=progress[word.category][word.level]??={solved:[],attempted:[],active:null,round:null,completed:true};
    level.solved.push(word.word);level.attempted.push(word.word);
  }
  const data={version:1,progress,profile:{nickname:'Дамиан',certificateDate:'2026-10-20'},score:{wins:1000,losses:3},stats:{bestStreak:7},hints:{version:1,updatedAt:10,balances:{letter:2}}};
  const player=await a.platform.createPlayer();await player.getData(['save']);await player.setData({save:data});
  const device2=environment({remote:a.remote});const player2=await device2.platform.createPlayer();
  assert.deepEqual(JSON.parse(JSON.stringify((await player2.getData(['save'])).save)),data,'Full progress must survive another device');

  // Interrupted writes cannot replace the last complete snapshot.
  const broken=environment({remote:a.remote,fail:(m,args)=>m==='VKWebAppStorageSet'&&args.key.endsWith('_1')});
  const brokenPlayer=await broken.platform.createPlayer();await brokenPlayer.getData(['save']);
  await assert.rejects(brokenPlayer.setData({save:{...data,score:{wins:1001}}}));
  const afterFailure=await environment({remote:a.remote}).platform.createPlayer();
  assert.equal((await afterFailure.getData(['save'])).save.score.wins,1000);

  const updated={...data,score:{wins:1002}};await player2.setData({save:updated});
  await assert.rejects(player.setData({save:data}),/другом устройстве/,'Stale device must not overwrite newer progress');
  const corrupt=environment({remote:new Map([['ugadai_v1_meta','{bad']])});
  const corruptPlayer=await corrupt.platform.createPlayer();await assert.rejects(corruptPlayer.getData(['save']));
  await assert.rejects(corruptPlayer.setData({save:data}));assert.equal(corrupt.writes.length,0);

  // Integrate the existing cloud merge and restore cached UI modules before gameplay.
  let statsReloaded=0,rewardsReloaded=0;
  const restore=environment({remote:a.remote});restore.ctx.window.GameStats={reload(){statsReloaded++;}};
  restore.ctx.window.GameRewards={reload(){rewardsReloaded++;}};
  vm.runInContext(read('cloud-save.js'),restore.ctx);await restore.ctx.window.GameCloud.prepare();
  assert(restore.ctx.window.GameCloud.isAuthorized());assert.equal(restore.ctx.window.GameCloud.getState(),'ready');
  assert.equal(JSON.parse(restore.platform.storage.getItem('ugadai-slovo-score-v1')).wins,1002);
  assert.equal(statsReloaded,1);assert.equal(rewardsReloaded,1);
  await restore.ctx.window.GameCloud.flush();assert.equal(restore.ctx.window.GameCloud.getState(),'saved');

  const unreadable=environment({remote:a.remote,fail:m=>m==='VKWebAppStorageGet'});
  vm.runInContext(read('cloud-save.js'),unreadable.ctx);await unreadable.ctx.window.GameCloud.prepare();
  await unreadable.ctx.window.GameCloud.flush();assert.equal(unreadable.ctx.window.GameCloud.getState(),'offline');assert.equal(unreadable.writes.length,0);
  const html=read('index.html');assert(html.indexOf('vk-platform.js')<html.indexOf('hints.js'));
  assert(html.indexOf('vk-platform.js')<html.indexOf('stats.js'));
  for(const file of ['vk-platform.js','cloud-save.js','game-bootstrap.js','script.js'])new vm.Script(read(file),{filename:file});
  console.log('OK: VK account isolation, identity check, full 1000-word transfer, failed writes, corrupt reads, stale device protection, cloud restore and pause.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
