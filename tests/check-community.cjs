// Calendar and motivation boundaries: no network, no leaderboard writes.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');const store=new Map();let now=new Date(2026,9,1,12).getTime();
class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const stats={Date:Clock,window:{},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}};vm.createContext(stats);vm.runInContext(fs.readFileSync(path.join(root,'stats.js'),'utf8'),stats);
const tracker=stats.window.GameStats;
tracker.record(true,1,false);assert.equal(tracker.snapshot().consecutiveDays,1);
tracker.record(true,2,false);assert.equal(tracker.snapshot().consecutiveDays,1,'Multiple daily wins count once');
now=new Date(2026,9,2,12).getTime();assert.equal(tracker.snapshot().consecutiveDays,1,'Yesterday streak remains until today ends');
tracker.record(false,4,true);assert.equal(tracker.snapshot().consecutiveDays,1,'Loss does not count as a new daily win');
tracker.record(true,1,false);assert.equal(tracker.snapshot().consecutiveDays,2);
now=new Date(2026,9,4,12).getTime();assert.equal(tracker.snapshot().consecutiveDays,0,'Missed day breaks streak');
tracker.record(true,3,false);assert.equal(tracker.snapshot().consecutiveDays,1);assert.equal(tracker.snapshot().bestDays,2);
now=new Date(2026,9,5,12).getTime();tracker.record(true,3,false);assert.equal(tracker.snapshot().consecutiveDays,2);
const rank={window:{},addEventListener(){}};vm.createContext(rank);vm.runInContext(fs.readFileSync(path.join(root,'rankings.js'),'utf8'),rank);
const mission=rank.window.GameRankings.mission;
assert(mission(0).includes('первым'));for(const n of [1,2])assert(mission(n).includes('тройку'));
for(const n of [3,4])assert(mission(n).includes('пятёрку'));for(const n of [5,9])assert(mission(n).includes('десятку'));
assert(mission(10).includes('25'));assert(mission(25).includes('50'));assert(mission(50).includes('сотню'));assert(mission(100).includes('101'));
assert(!mission(undefined).includes('первым'),'Unavailable board must never claim nobody finished');
console.log('OK: daily winning streak, missed days, best streak, truthful first/3/5/10/25/50/100 motivation.');
