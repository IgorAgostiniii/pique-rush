import { HALF, FINISH, obstacles, type Obstacle, type Runner } from './race';
import frames from './art-frames.json';

type Mode='lobby'|'waiting'|'playing'|'done';
type AssetName='street'|'runners'|'duel'|'props';

/** Painted sprites with a perspective track. All collision positions come from the shared race engine. */
export class Arena {
  readonly ready:Promise<void>;
  private ctx:CanvasRenderingContext2D;
  private images={} as Record<AssetName,HTMLImageElement>;
  private width=0; private height=0;
  private distance=0; private lane=1; private lastTime=0; private hits=0;
  private seed=-1; private items:Obstacle[]=[];
  private observer:ResizeObserver;
  private loaded=false;
  private reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private disposed=false;
  private phase=0;

  constructor(private canvas:HTMLCanvasElement){
    const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('Canvas unavailable');this.ctx=ctx;
    this.ready=Promise.all((['street','runners','duel','props'] as AssetName[]).map(name=>new Promise<void>((resolve,reject)=>{
      const image=new Image();image.onload=()=>{this.images[name]=image;resolve();};image.onerror=()=>reject(new Error(`Could not load ${name}`));image.src=`/art/${name}.webp`;
    }))).then(()=>{this.loaded=true;});
    this.observer=new ResizeObserver(()=>this.fit());this.observer.observe(canvas);this.fit();
  }
  private fit(){const r=this.canvas.getBoundingClientRect();this.width=r.width;this.height=r.height;const dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(r.width*dpr);this.canvas.height=Math.round(r.height*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);this.ctx.imageSmoothingEnabled=true;this.ctx.imageSmoothingQuality='high';}
  private cover(img:HTMLImageElement,x:number,y:number,w:number,h:number,focusX=.5,focusY=.5){const scale=Math.max(w/img.width,h/img.height),dw=img.width*scale,dh=img.height*scale;this.ctx.drawImage(img,x-(dw-w)*focusX,y-(dh-h)*focusY,dw,dh);}
  private sprite(img:HTMLImageElement,col:number,row:number,cols:number,rows:number,x:number,y:number,w:number,h:number){
    const runner=img===this.images.runners;const f=(runner?frames.runners:frames.props)[row*cols+col];
    const scale=runner?Math.min(w/225,h/481):Math.min(w/f.w,h/f.h);
    const dw=f.w*scale,dh=f.h*scale;this.ctx.drawImage(img,f.x,f.y,f.w,f.h,x-dw/2,y-dh,dw,dh);
  }
  private path(points:number[][],fill:string){const c=this.ctx;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();}
  private point(lane:number,z:number){const w=this.width,h=this.height;const t=Math.max(0,Math.min(1.22,1-z/115));const q=t*t;return {x:w/2+(lane-1)*w*.32*(.12+.88*q),y:h*.443+h*.557*q,s:.1+.9*q};}
  private shadow(x:number,y:number,w:number,alpha=.16){const c=this.ctx;c.fillStyle=`rgba(79,56,36,${alpha})`;c.beginPath();c.ellipse(x,y,w,w*.24,0,0,Math.PI*2);c.fill();}
  render(p:Runner,seed:number,team:number,time:number,mode:Mode,active:boolean){
    if(!this.loaded||this.disposed)return;
    const w=this.width,h=this.height,c=this.ctx,dt=Math.min(.05,(time-this.lastTime)/1000||.016);this.lastTime=time;
    if(seed!==this.seed){this.seed=seed;this.items=obstacles(seed);}
    if(p.hits!==this.hits||Math.abs(this.distance-p.distance)>8){this.distance=p.distance;this.hits=p.hits;}else this.distance+=(p.distance-this.distance)*(1-Math.exp(-dt*19));
    this.lane+=(p.lane-this.lane)*(1-Math.exp(-dt*17));
    c.clearRect(0,0,w,h);
    if(mode==='lobby'){
      const img=this.images.duel;
      if(w<700){
        const sky=c.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#91d9ee');sky.addColorStop(.7,'#f4d8a5');sky.addColorStop(1,'#e5bd81');c.fillStyle=sky;c.fillRect(0,0,w,h);
        // Preserve both painted characters in the portrait crop, leaving room for the menu.
        const dh=Math.min(h*.88,w*1.4),dw=dh*img.width/img.height;
        this.cover(img,0,0,w,h,.5,.3);
        c.drawImage(img,(w-dw)/2,h*.18,dw,dh);
      }else{
        this.cover(img,0,0,w,h,.23,.45);
      }
      return;
    }
    // The environment is painted; the road marks, sprites and particles move in perspective.
    c.drawImage(this.images.street,0,0,w,h);
    c.save();c.beginPath();c.moveTo(w*.495,h*.443);c.lineTo(w*.505,h*.443);c.lineTo(w*1.04,h);c.lineTo(-w*.04,h);c.closePath();c.clip();
    const road=c.createLinearGradient(0,h*.443,0,h);road.addColorStop(0,'rgba(244,220,170,0)');road.addColorStop(.2,'rgba(234,199,145,.25)');road.addColorStop(1,'rgba(222,181,129,.42)');c.fillStyle=road;c.fillRect(0,h*.443,w,h*.557);
    const travel=this.distance;
    for(let i=0;i<28;i++){
      const z=i*4.7-travel%4.7,a=this.point(-.62,z),b=this.point(2.62,z);
      c.strokeStyle=`rgba(136,98,62,${.03+a.s*.10})`;c.lineWidth=Math.max(.5,a.s*1.3);c.beginPath();c.moveTo(a.x,a.y);c.quadraticCurveTo(w*.48,a.y-2*a.s,b.x,b.y);c.stroke();
      for(let j=0;j<6;j++){const lane=-.5+j*.6+(i%2)*.3;const v=this.point(lane,z),u=this.point(lane,z+4.7);c.beginPath();c.moveTo(v.x,v.y);c.lineTo(u.x,u.y);c.stroke();}
    }
    // Subtle route guides keep the three lanes readable without painting over the artwork.
    for(const lane of [.5,1.5])for(let i=0;i<15;i++){const z=i*8-travel%8;const a=this.point(lane,z),b=this.point(lane,z+3);c.strokeStyle='rgba(255,251,224,.45)';c.lineWidth=Math.max(1,a.s*2);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}
    c.restore();
    const drawn:{z:number;draw:()=>void}[]=[];
    const target=p.distance<HALF?HALF:FINISH;
    if(target-travel<108){const z=target-travel+16;drawn.push({z,draw:()=>{const v=this.point(1,z);this.shadow(v.x,v.y,w*.07*v.s);const sz=w*.40*v.s;this.sprite(this.images.props,2,p.distance<HALF?(team===0?0:1):(team===0?1:0),3,2,v.x,v.y,sz,sz);}});}
    for(const o of this.items){const z=o.d-travel+16;if(z<8||z>112)continue;drawn.push({z,draw:()=>{const v=this.point(o.lane,z),sz=w*(o.high?.40:.38)*v.s;this.shadow(v.x,v.y,sz*.31);this.sprite(this.images.props,o.high?1:0,team===0?0:1,3,2,v.x,v.y,sz,sz);}});}
    const position=this.point(this.lane,16);
    const jump=p.jump>0?Math.sin(Math.PI*(1-p.jump/.82))*h*.125:0;
    if(active)this.phase+=dt*10;
    drawn.push({z:16,draw:()=>{
      const size=Math.min(w*.40,h*.255),sw=size*.75;
      this.shadow(position.x,position.y,sw*.25*(1-jump/h),.20);
      if(p.stun>0)c.globalAlpha=.45+Math.abs(Math.sin(time*.024))*.45;
      const frame=p.jump>0?3:active&&!this.reduced?Math.floor(this.phase)%4:1;
      const bob=active&&p.jump===0&&!this.reduced?Math.sin(this.phase*Math.PI/2)*1.8:0;
      c.save();c.translate(position.x,position.y-jump+bob);c.rotate((p.lane-this.lane)*.075);
      this.sprite(this.images.runners,frame,team,4,2,0,0,sw,size);
      if(p.distance>=HALF){const flagSize=size*.73;this.sprite(this.images.props,2,team===0?0:1,3,2,sw*.43,-size*.42,flagSize,flagSize);}
      c.restore();c.globalAlpha=1;
    }});
    drawn.sort((a,b)=>b.z-a.z).forEach(item=>item.draw());
    if(active&&!this.reduced){
      // Footfall dust and edge streaks make speed visible without obscuring the track.
      for(let i=0;i<8;i++){const t=(time*.002+i*.17)%1;const x=position.x+Math.sin(i*4)*w*.065*t,y=position.y+t*h*.05;c.fillStyle=`rgba(255,238,195,${(1-t)*.26})`;c.beginPath();c.ellipse(x,y,2+t*6,1+t*2,0,0,Math.PI*2);c.fill();}
      for(const side of [-1,1])for(let i=0;i<4;i++){const t=(time*.0007+i*.24)%1;c.strokeStyle=`rgba(255,255,240,${t*.22})`;c.lineWidth=1+t*2;c.beginPath();c.moveTo(w/2+side*w*(.38+t*.09),h*(.52+t*.28));c.lineTo(w/2+side*w*(.40+t*.12),h*(.55+t*.3));c.stroke();}
    }
    if(mode==='done')for(let i=0;i<40;i++){const x=(Math.sin(i*93.3)*.5+.5)*w,y=((time*.05+i*39)%(h+30))-30;c.fillStyle=['#ffcd4c','#3e9fff','#ff687a','#fff8d8'][i%4];c.save();c.translate(x,y);c.rotate(time*.001+i);c.fillRect(-3,-5,6,10);c.restore();}
  }
  dispose(){this.disposed=true;this.observer.disconnect();}
}
