export const HALF = 240;
export const FINISH = HALF * 2;
export const SPEED = 17;
export type Runner = { distance:number; lane:number; jump:number; jumpSeq:number; hits:number; stun:number; seen:number; name:string; vote:boolean };
export type Race = { phase:'waiting'|'playing'|'done'; start:number; updated:number; seed:number; players:[Runner,Runner]; winner:number|null; paused:boolean };
export type Obstacle = {d:number; lane:number; high:boolean};
export function obstacles(seed:number):Obstacle[] {
  let s=seed>>>0; const rand=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296};
  const a:Obstacle[]=[];
  for(let d=34;d<FINISH-15;d+=19){if(Math.abs(d-HALF)<17)continue;const lane=Math.floor(rand()*3);a.push({d,lane,high:rand()>.6});if(rand()>.65)a.push({d,lane:(lane+1)%3,high:false});}
  return a;
}
export function runner(name:string,now:number):Runner {return {distance:0,lane:1,jump:0,jumpSeq:0,hits:0,stun:0,seen:now,name,vote:false};}
export function newRace(name:string,now:number):Race {return {phase:'waiting',start:0,updated:now,seed:Math.floor(Math.random()*1e8),players:[runner(name,now),runner('Vermelho',0)],winner:null,paused:false};}
export function advancePlayer(p:Runner,dt:number,items:Obstacle[]) {
  let left=dt;
  while(left>0){const step=Math.min(left,1/60);left-=step;p.jump=Math.max(0,p.jump-step);if(p.stun>0){p.stun=Math.max(0,p.stun-step);continue;}
    const next=Math.min(FINISH,p.distance+step*SPEED);
    const hit=items.find(o=>o.lane===p.lane&&o.d>p.distance&&o.d<=next&&(o.high||p.jump<.12||p.jump>.70));
    if(hit){p.distance=0;p.hits++;p.stun=.9;p.jump=0;}else p.distance=next;
  }
}
export function advance(r:Race,now:number) {
  if(r.phase!=='playing'){r.updated=now;return;}
  const disconnected=r.players.some(p=>now-p.seen>4500);
  if(disconnected){r.paused=true;r.updated=now;return;}
  if(r.paused){r.paused=false;r.start=now+3000;r.updated=now;return;}
  const dt=Math.max(0,Math.min(.8,(now-Math.max(r.updated,r.start))/1000));
  const items=obstacles(r.seed);
  const finishTimes=r.players.map(p=>p.distance<FINISH&&p.stun===0?(FINISH-p.distance)/SPEED:Infinity);
  r.players.forEach(p=>advancePlayer(p,dt,items));
  const finished=r.players.map((p,i)=>p.distance>=FINISH?i:-1).filter(i=>i>=0);
  if(finished.length){r.winner=finished.length===2?(finishTimes[0]===finishTimes[1]?-1:finishTimes[0]<finishTimes[1]?0:1):finished[0];r.phase='done';}
  r.updated=now;
}
