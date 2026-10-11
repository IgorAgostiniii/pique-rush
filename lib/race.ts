export const HALF = 240;
export const FINISH = HALF * 2;
export const SPEED = 17;
export type Runner = { distance:number; coins?:number; flags?:number; lane:number; jump:number; jumpSeq:number; hits:number; stun:number; seen:number; name:string; vote:boolean };
export type Race = { phase:'waiting'|'playing'|'done'; start:number; updated:number; seed:number; players:[Runner,Runner]; winner:number|null; paused:boolean };
export type Obstacle = {d:number; lane:number; high:boolean};
export function theme(distance:number){
  const section=Math.floor(distance/320)%3;
  return [
    {label:'VILA DO SOL', accent:'#ffcf52'},
    {label:'FEIRA DAS FLORES', accent:'#ff7e8d'},
    {label:'ORLA AZUL', accent:'#58cce1'},
  ][section];
}
export function obstacles(seed:number,distance=0):Obstacle[] {
  const a:Obstacle[]=[];
  const section=Math.floor(distance/480);
  for(let chunk=Math.max(0,section-1);chunk<=section+1;chunk++){
    let s=(seed+chunk*7919)>>>0;const rand=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296};
    for(let d=chunk*480+34;d<(chunk+1)*480-10;d+=19){
      const row=Math.round((d-chunk*480-34)/19),pattern=(chunk+seed)%4;
      const lane=pattern===0?row%3:pattern===1?[0,2,2,0][row%4]:pattern===2?[1,0,2,1][row%4]:Math.floor(rand()*3);
      a.push({d,lane,high:row%4===3});
      // Alternating gates make each district ask for a different movement.
      if(row>3&&row%4===2)a.push({d,lane:(lane+1)%3,high:false});
      if(pattern===3&&row%5===1)a.push({d:d+5,lane:(lane+2)%3,high:true});
    }
  }
  return a;
}
export function runner(name:string,now:number):Runner {return {distance:0,lane:1,jump:0,jumpSeq:0,hits:0,stun:0,seen:now,name,vote:false};}
export function newRace(name:string,now:number):Race {return {phase:'waiting',start:0,updated:now,seed:Math.floor(Math.random()*1e8),players:[runner(name,now),runner('Vermelho',0)],winner:null,paused:false};}
export type Pickup={d:number;lane:number;flag:boolean};
export function pickups(seed:number,distance:number):Pickup[]{
 const items=obstacles(seed,distance),out:Pickup[]=[];
 for(let i=Math.max(1,Math.floor((distance-20)/10));i<=Math.ceil((distance+140)/10);i++){
  const d=i*10,blocked=items.filter(o=>Math.abs(o.d-d)<7).map(o=>o.lane);
  const preferred=(Math.floor(i/4)+seed)%3;
  const lane=[preferred,(preferred+1)%3,(preferred+2)%3].find(l=>!blocked.includes(l));
  if(lane!==undefined)out.push({d,lane,flag:i%12===0});
 }
 return out;
}
export function score(p:Runner){return Math.floor(p.distance*10)+(p.coins??0)*50+(p.flags??0)*1000;}
export function speed(distance:number){return SPEED+Math.min(10,Math.floor(distance/240)*1.5);}
export function advancePlayer(p:Runner,dt:number,items:Obstacle[],seed=0) {
  let left=dt;const rewards=pickups(seed,p.distance);
  while(left>0){const step=Math.min(left,1/60);left-=step;p.jump=Math.max(0,p.jump-step);if(p.stun>0){p.stun=Math.max(0,p.stun-step);continue;}
    const next=p.distance+step*speed(p.distance);
    const hit=items.find(o=>o.lane===p.lane&&o.d>p.distance&&o.d<=next&&(o.high||p.jump<.12||p.jump>.70));
    if(hit){p.distance=hit.d;p.hits++;p.stun=.9;p.jump=0;return;}else {for(const item of rewards)if(item.lane===p.lane&&item.d>p.distance&&item.d<=next){if(item.flag)p.flags=(p.flags??0)+1;else p.coins=(p.coins??0)+1;}p.distance=next;}
  }
}
export function advance(r:Race,now:number) {
  if(r.phase!=='playing'){r.updated=now;return;}
  const disconnected=r.players.some(p=>now-p.seen>4500);
  if(disconnected){r.paused=true;r.updated=now;return;}
  if(r.paused){r.paused=false;r.start=now+3000;r.updated=now;return;}
  const dt=Math.max(0,Math.min(.8,(now-Math.max(r.updated,r.start))/1000));
  r.players.forEach(p=>advancePlayer(p,dt,obstacles(r.seed,p.distance),r.seed));
  if(r.players.some(p=>p.hits>0)){r.winner=r.players.every(p=>p.hits>0)?-1:r.players[0].hits>0?1:0;r.phase='done';}
  r.updated=now;
}
