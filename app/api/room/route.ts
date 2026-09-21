import { env } from 'cloudflare:workers';
import { advance, newRace, runner, type Race } from '../../../lib/race';
export const dynamic='force-dynamic';
type Room={code:string;blue:string;red:string|null;state:string;revision:number;expires:number};
function db(){if(!env.DB)throw Error('Database unavailable');return env.DB;}
function reply(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
function name(v:unknown){return typeof v==='string'?v.trim().slice(0,18)||'Jogador':'Jogador';}
export async function POST(req:Request){
  try{
    const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return reply({error:'Origem inválida.'},403);
    if(Number(req.headers.get('content-length'))>3000)return reply({error:'Pedido muito grande.'},413);
    const b=await req.json() as Record<string,unknown>;const now=Date.now();
    if(b.op==='create'){
      const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for(let i=0;i<4;i++){
        const bytes=crypto.getRandomValues(new Uint8Array(6));const code=Array.from(bytes,n=>alphabet[n%alphabet.length]).join('');const token=crypto.randomUUID();const state=newRace(name(b.name),now);
        const result=await db().prepare('INSERT OR IGNORE INTO rooms (code,blue,state,revision,expires) VALUES (?,?,?,0,?)').bind(code,token,JSON.stringify(state),now+7200000).run();
        if(result.meta.changes)return reply({code,token,team:0,state,serverNow:now});
      }return reply({error:'Não foi possível criar a sala. Tente novamente.'},503);
    }
    if(typeof b.code!=='string'||!/^[A-Z2-9]{6}$/.test(b.code))return reply({error:'Digite os 6 caracteres da sala.'},400);
    for(let attempt=0;attempt<8;attempt++){
      const row=await db().prepare('SELECT * FROM rooms WHERE code=?').bind(b.code).first<Room>();
      if(!row||row.expires<now)return reply({error:'Sala não encontrada ou expirada. Crie uma nova sala.'},404);
      const state=JSON.parse(row.state) as Race;let team:number;let token:string;
      if(b.op==='join'){
        if(row.red)return reply({error:'Essa sala já tem dois jogadores.'},409);
        team=1;token=crypto.randomUUID();state.players[1]=runner(name(b.name),now);state.phase='playing';state.start=now+4000;state.updated=now;
        const result=await db().prepare('UPDATE rooms SET red=?,state=?,revision=revision+1 WHERE code=? AND revision=? AND red IS NULL').bind(token,JSON.stringify(state),b.code,row.revision).run();
        if(result.meta.changes)return reply({code:b.code,token,team,state,serverNow:now});continue;
      }
      if(typeof b.token!=='string'||(b.token!==row.blue&&b.token!==row.red))return reply({error:'Entre novamente na sala.'},403);
      token=b.token;team=token===row.blue?0:1;
      if(b.op!=='sync'&&b.op!=='replay')return reply({error:'Ação inválida.'},400);
      advance(state,now);const p=state.players[team];p.seen=now;
      if(b.op==='replay'&&state.phase==='done'){
        p.vote=true;if(state.players.every(p=>p.vote)){
          state.players=state.players.map(p=>runner(p.name,now)) as Race['players'];state.seed=Math.floor(Math.random()*1e8);state.winner=null;state.start=now+4000;state.updated=now;state.phase='playing';state.paused=false;
        }
      }
      if(b.op==='sync'&&state.phase==='playing'){
        if(Number.isInteger(b.lane)&&Number(b.lane)>=0&&Number(b.lane)<=2)p.lane=Number(b.lane);
        if(Number.isSafeInteger(b.jumpSeq)&&Number(b.jumpSeq)>p.jumpSeq){p.jumpSeq=Number(b.jumpSeq);if(p.jump===0&&p.stun===0&&now>=state.start&&!state.paused)p.jump=.82;}
      }
      const result=await db().prepare('UPDATE rooms SET state=?,revision=revision+1 WHERE code=? AND revision=?').bind(JSON.stringify(state),b.code,row.revision).run();
      if(result.meta.changes)return reply({code:b.code,team,state,serverNow:now});
    }
    return reply({error:'Conexão ocupada. Tentando novamente.'},503);
  }catch(e){console.error('Room request failed',e);return reply({error:'Não foi possível conectar. Confira sua internet e tente novamente.'},503);}
}
