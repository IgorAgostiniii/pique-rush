import { pickups, obstacles, theme, type Obstacle, type Runner } from './race';
import frames from './art-frames.json';

type Mode='lobby'|'waiting'|'playing'|'done';
type AssetName='overhead'|'street'|'runners'|'duel'|'props';

/** Painted sprites with a perspective track. All collision positions come from the shared race engine. */
export class Arena {
  readonly ready:Promise<void>;
  private ctx:CanvasRenderingContext2D;
  private images={} as Record<AssetName,HTMLImageElement>;
  private streetLayer:HTMLCanvasElement|null=null;
  private width=0; private height=0;
  private distance=0; private lane=1; private lastTime=0; private hits=0;
  private cameraDistance=0;
  private section=-1; private seed=-1; private items:Obstacle[]=[];
  private observer:ResizeObserver;
  private loaded=false;
  private reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private disposed=false;
  private phase=0;
  private collectedCoins=0; private collectedFlags=0;
  private rewards:{life:number;flag:boolean;x:number;y:number}[]=[];
  private previousJump=0; private landing=0; private impact=0;
  private motionTime=0;

  constructor(private canvas:HTMLCanvasElement){
    const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('Canvas unavailable');this.ctx=ctx;
    this.ready=Promise.all((['overhead','street','runners','duel','props'] as AssetName[]).map(name=>new Promise<void>((resolve,reject)=>{
      const image=new Image();image.onload=()=>{this.images[name]=image;resolve();};image.onerror=()=>reject(new Error(`Could not load ${name}`));image.src=`/art/${name}.webp`;
    }))).then(()=>{
      // Cache the feathered leading edge once. Adjacent copies overlap rather
      // than exposing the unrelated top/bottom edges of the painting.
      const source=this.images.overhead,layer=document.createElement('canvas');
      layer.width=source.width;layer.height=source.height;
      const brush=layer.getContext('2d')!;
      brush.drawImage(source,0,0);
      brush.globalCompositeOperation='destination-in';
      const fade=brush.createLinearGradient(0,0,0,source.height*.18);
      fade.addColorStop(0,'rgba(0,0,0,0)');
      fade.addColorStop(1,'rgba(0,0,0,1)');
      brush.fillStyle=fade;brush.fillRect(0,0,source.width,source.height);
      this.streetLayer=layer;this.loaded=true;
    });
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
  private point(lane:number,z:number){return {x:this.width*(.5+(lane-1)*.23),y:this.height*(.94-z/110),s:1};}
  private shadow(x:number,y:number,w:number,alpha=.16){const c=this.ctx;c.fillStyle=`rgba(79,56,36,${alpha})`;c.beginPath();c.ellipse(x,y,w,w*.24,0,0,Math.PI*2);c.fill();}
  render(p:Runner,seed:number,team:number,time:number,mode:Mode,active:boolean,skin=0){
    if(!this.loaded||this.disposed)return;
    const w=this.width,h=this.height,c=this.ctx,dt=Math.min(.05,(time-this.lastTime)/1000||.016);this.lastTime=time;
    if(seed!==this.seed){this.seed=seed;this.items=obstacles(seed,p.distance);this.hits=p.hits;this.previousJump=0;this.landing=0;this.impact=0;this.cameraDistance=Math.max(0,p.distance-13);this.collectedCoins=p.coins??0;this.collectedFlags=p.flags??0;this.rewards=[];}
    if(Math.floor(p.distance/480)!==this.section){this.section=Math.floor(p.distance/480);this.items=obstacles(seed,p.distance);}
    const rewardPosition=this.point(this.lane,16+this.distance-this.cameraDistance);
    if((p.coins??0)>this.collectedCoins||(p.flags??0)>this.collectedFlags){
      this.rewards.push({life:1,flag:(p.flags??0)>this.collectedFlags,x:rewardPosition.x,y:rewardPosition.y-this.height*.12});
      this.collectedCoins=Math.max(this.collectedCoins,p.coins??0);this.collectedFlags=Math.max(this.collectedFlags,p.flags??0);
    }
    this.rewards=this.rewards.filter(r=>(r.life-=dt*.9)>0);
    if(p.hits>this.hits&&!this.reduced)this.impact=1;
    if(this.previousJump>0&&p.jump===0&&p.stun===0&&!this.reduced)this.landing=1;
    this.previousJump=p.jump;
    this.landing=Math.max(0,this.landing-dt*4);this.impact=Math.max(0,this.impact-dt*3);
    if(active&&!this.reduced)this.motionTime+=dt;
    if(p.hits!==this.hits||Math.abs(this.distance-p.distance)>8){this.distance=p.distance;this.hits=p.hits;}else this.distance+=(p.distance-this.distance)*(1-Math.exp(-dt*19));
    // Runner and camera have separate world positions. The runner leaves the
    // foreground first; the follow camera eases forward behind them.
    if(p.distance<this.cameraDistance)this.cameraDistance=Math.max(0,p.distance-13);
    if(active)this.cameraDistance+=(Math.max(0,this.distance-13)-this.cameraDistance)*(1-Math.exp(-dt*3));
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
    c.save();
    if(this.impact>0)c.translate(Math.sin(time*.065)*this.impact*5,Math.cos(time*.08)*this.impact*3);
    // Orthographic overhead track: the artwork scrolls, never zooms.
    const travel=this.cameraDistance, street=this.images.overhead;
    // Draw the complete orthographic illustration at its natural aspect ratio.
    const tileHeight=w*street.height/street.width;
    const spacing=tileHeight*.82;
    const offset=(travel*h/110)%spacing;
    c.fillStyle='#e5ca98';c.fillRect(0,0,w,h);
    for(let y=offset-spacing*2;y<h;y+=spacing){
      c.drawImage(this.streetLayer!,0,y,w,tileHeight);
    }
    const district=theme(p.distance);
    // Each district gets a light, painted atmosphere while preserving the
    // same clear road and fixed-size obstacle view.
    if(district.label==='FEIRA DAS FLORES'){
      c.save();c.globalAlpha=.22;
      for(let y=45;y<h;y+=150){for(const side of [0,1]){c.fillStyle=side?'#ef7882':'#ffc35b';c.beginPath();c.moveTo(side?w*.88:w*.12,y);c.lineTo(side?w:w*.02,y+18);c.lineTo(side?w*.88:w*.12,y+36);c.closePath();c.fill();}}
      c.restore();
    }else if(district.label==='ORLA AZUL'){
      c.save();c.globalAlpha=.2;c.fillStyle='#52c8de';c.fillRect(0,0,w*.105,h);c.fillRect(w*.895,0,w*.105,h);
      c.strokeStyle='#dcfbff';c.lineWidth=2;for(let y=15;y<h;y+=25){c.beginPath();c.moveTo(0,y);c.quadraticCurveTo(w*.05,y-8,w*.10,y);c.moveTo(w*.90,y);c.quadraticCurveTo(w*.95,y-8,w,y);c.stroke();}c.restore();
    }
    const drawn:{z:number;draw:()=>void}[]=[];
    for(const item of pickups(seed,p.distance)){
      const z=item.d-travel+16;if(item.d<=p.distance||z>108||z<0)continue;
      drawn.push({z,draw:()=>{
        const v=this.point(item.lane,z),size=Math.min(w*.17,h*.11);
        c.save();c.globalAlpha=Math.min(1,(110-z)/10);
        this.shadow(v.x,v.y,size*.28,.12);
        if(item.flag){
          const bob=this.reduced?0:Math.sin(time*.004+item.d)*3;
          c.save();c.translate(v.x,v.y+bob);c.rotate(this.reduced?0:Math.sin(time*.003)*.045);
          this.sprite(this.images.props,2,team===0?0:1,3,2,0,0,size,size);c.restore();
        }else{
          const radius=Math.min(w*.029,19),angle=this.reduced?0:time*.0024+item.d;
          const turn=Math.max(.17,Math.abs(Math.cos(angle)));
          const bob=this.reduced?0:Math.sin(time*.003+item.d)*2;
          c.translate(v.x,v.y-radius*1.4+bob);
          // Warm rim, engraved centre and moving specular highlight.
          c.save();c.scale(turn,1);
          for(let depth=3;depth>=0;depth--){
            c.fillStyle=depth?'#a96816':'#f6bc37';c.beginPath();c.ellipse(depth,1,radius,radius,0,0,Math.PI*2);c.fill();
          }
          const gold=c.createLinearGradient(-radius,-radius,radius,radius);
          gold.addColorStop(0,'#fff6ba');gold.addColorStop(.3,'#ffdc63');gold.addColorStop(.65,'#d9901d');gold.addColorStop(1,'#ffdf70');
          c.fillStyle=gold;c.beginPath();c.arc(0,0,radius*.91,0,Math.PI*2);c.fill();
          c.strokeStyle='#9b6018';c.lineWidth=1.3;c.beginPath();c.arc(0,0,radius*.70,0,Math.PI*2);c.stroke();
          c.strokeStyle='#fff1a0';c.lineWidth=1;c.beginPath();c.arc(-.5,-.5,radius*.74,Math.PI,Math.PI*1.85);c.stroke();
          // Engraved flag emblem ties currency to the game's objective.
          c.strokeStyle='#a36616';c.lineWidth=2;c.beginPath();c.moveTo(-radius*.23,radius*.43);c.lineTo(-radius*.23,-radius*.4);c.stroke();
          this.path([[-radius*.18,-radius*.4],[radius*.36,-radius*.3],[radius*.16,-radius*.04],[-radius*.18,-radius*.12]],'#b57720');
          c.strokeStyle='rgba(255,255,225,.85)';c.lineWidth=1.7;c.beginPath();c.arc(0,0,radius*.88,angle,angle+.7);c.stroke();
          c.restore();
        }
        c.restore();
      }});
    }
    for(const o of this.items){const z=o.d-travel+16;if(z< -16||z>112)continue;drawn.push({z,draw:()=>{const v=this.point(o.lane,z),sz=Math.min(w*.22,h*.14);c.save();c.globalAlpha=Math.min(1,(112-z)/12,Math.max(0,(z+16)/12));this.shadow(v.x,v.y,sz*.31);this.sprite(this.images.props,o.high?1:0,team===0?0:1,3,2,v.x,v.y,sz,sz);c.restore();}});}
    const runnerDepth=16+this.distance-this.cameraDistance;
    const position=this.point(this.lane,runnerDepth);
    const runnerScale=position.s/this.point(1,16).s;
    const jump=p.jump>0?Math.sin(Math.PI*(1-p.jump/.82))*h*.065:0;
    if(active&&p.stun===0&&!this.reduced)this.phase+=dt*8;
    drawn.push({z:runnerDepth,draw:()=>{
      const size=Math.min(w*.28,h*.16)*runnerScale,sw=size*.75;
      this.shadow(position.x,position.y,sw*.25*(1-jump/h),.20);
      if(p.stun>0)c.globalAlpha=.65;
      // The fourth atlas pose is a jump, not a running stride.
      const frame=p.jump>0?3:active&&p.stun===0&&!this.reduced?[0,1,2,1][Math.floor(this.phase)%4]:1;
      const stride=active&&p.stun===0&&p.jump===0&&!this.reduced?Math.sin(this.phase*Math.PI):0;
      const bob=-Math.abs(stride)*1.5;
      c.save();c.translate(position.x,position.y-jump+bob);c.rotate((p.lane-this.lane)*.14+stride*.009);
      c.scale(1+this.landing*.06+Math.abs(stride)*.012,1-this.landing*.07-Math.abs(stride)*.008);
      // The first two characters use the painted originals; the two premium
      // unlocks use the same illustrated pose set with their own color grade.
      c.filter=skin===2?'hue-rotate(260deg) saturate(1.2)':'none';
      this.sprite(this.images.runners,frame,skin%2,4,2,0,0,sw,size);
      c.filter='none';
      c.restore();c.globalAlpha=1;
    }});
    drawn.sort((a,b)=>b.z-a.z).forEach(item=>item.draw());
    for(const reward of this.rewards){
      const age=1-reward.life,rise=this.reduced?0:age*42;
      c.save();c.globalAlpha=Math.min(1,reward.life*3);c.textAlign='center';c.font='900 '+(reward.flag?22:17)+'px Trebuchet MS';
      c.lineWidth=4;c.strokeStyle='#664523';c.fillStyle=reward.flag?'#fff5ae':'#ffe393';
      const label=reward.flag?'BANDEIRA! +1.000':'+50';
      c.strokeText(label,reward.x,reward.y-rise);c.fillText(label,reward.x,reward.y-rise);
      if(!this.reduced)for(let i=0;i<8;i++){const a=i*Math.PI/4,r=age*45;c.fillStyle=i%2?'#fff3bb':'#ffc84d';c.beginPath();c.arc(reward.x+Math.cos(a)*r,reward.y+Math.sin(a)*r-rise,Math.max(.5,reward.life*3),0,Math.PI*2);c.fill();}
      c.restore();
    }
    if(this.landing>0){const t=1-this.landing;c.strokeStyle=`rgba(255,238,195,${this.landing*.55})`;c.lineWidth=2;c.beginPath();c.ellipse(position.x,position.y,w*(.035+t*.10),h*(.004+t*.015),0,0,Math.PI*2);c.stroke();}
    if(this.impact>0){for(let i=0;i<10;i++){const a=i*Math.PI/5,t=1-this.impact;c.fillStyle=`rgba(255,221,99,${this.impact})`;c.beginPath();c.arc(position.x+Math.cos(a)*t*w*.18,position.y-h*.1+Math.sin(a)*t*h*.10,2+this.impact*3,0,Math.PI*2);c.fill();}}
    if(active&&p.stun===0&&p.jump===0&&!this.reduced){
      // Footfall dust and edge streaks make speed visible without obscuring the track.
      for(let i=0;i<8;i++){const t=(time*.002+i*.17)%1;const x=position.x+Math.sin(i*4)*w*.065*t,y=position.y+t*h*.05;c.fillStyle=`rgba(255,238,195,${(1-t)*.26})`;c.beginPath();c.ellipse(x,y,2+t*6,1+t*2,0,0,Math.PI*2);c.fill();}
      for(const side of [-1,1])for(let i=0;i<4;i++){const t=(time*.0007+i*.24)%1;c.strokeStyle=`rgba(255,255,240,${t*.22})`;c.lineWidth=1+t*2;c.beginPath();c.moveTo(w/2+side*w*(.38+t*.09),h*(.52+t*.28));c.lineTo(w/2+side*w*(.40+t*.12),h*(.55+t*.3));c.stroke();}
    }
    if(mode==='done'&&!this.reduced)for(let i=0;i<40;i++){const x=(Math.sin(i*93.3)*.5+.5)*w,y=((time*.05+i*39)%(h+30))-30;c.fillStyle=['#ffcd4c','#3e9fff','#ff687a','#fff8d8'][i%4];c.save();c.translate(x,y);c.rotate(time*.001+i);c.fillRect(-3,-5,6,10);c.restore();}
    c.restore();
  }
  dispose(){this.disposed=true;this.observer.disconnect();}
}
