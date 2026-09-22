import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FINISH, HALF, obstacles, type Runner } from './race';

type Avatar = {root:T.Group;body:T.Group;arms:T.Group[];legs:T.Group[];flag:T.Group;cap:T.Mesh;shirt:T.Mesh;pack:T.Mesh};
const BLUE=0x2586fb, RED=0xff4c63;

/** A small, self-contained scene: shared geometry, capped resolution, no downloaded assets. */
export class Arena {
  private renderer:T.WebGLRenderer;
  private scene=new T.Scene();
  private camera=new T.PerspectiveCamera(48,1,.1,170);
  private materials=new Map<number,T.MeshStandardMaterial>();
  private cube=new T.BoxGeometry(1,1,1);
  private round=new RoundedBoxGeometry(1,1,1,2,.13);
  private sphere=new T.SphereGeometry(1,16,12);
  private cylinder=new T.CylinderGeometry(1,1,1,12);
  private cone=new T.ConeGeometry(1,1,12);
  private runner:Avatar;
  private friend:Avatar;
  private scenery:{group:T.Group;z:number}[]=[];
  private obstaclesGroup=new T.Group();
  private obstacleNodes:{group:T.Group;d:number}[]=[];
  private targetFlag:T.Group;
  private laneMarks:T.Mesh[]=[];
  private bunting:T.Group[]=[];
  private confetti:T.Mesh[]=[];
  private seed=-1;
  private team=-1;
  private displayDistance=0;
  private laneX=0;
  private lastHits=0;
  private lastTime=0;
  private width=0;
  private height=0;
  private resize:ResizeObserver;
  private motionReduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private canvas:HTMLCanvasElement){
    this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.renderer.toneMapping=T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.28;
    this.scene.background=new T.Color(0x8addf3);
    this.scene.fog=new T.Fog(0xa5e3ef,45,140);
    this.scene.add(new T.HemisphereLight(0xe1f9ff,0xb69d6e,2.4));
    const sun=new T.DirectionalLight(0xfff1cf,3.2);sun.position.set(-16,26,15);sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-20,right:20,top:24,bottom:-24,near:1,far:80});sun.shadow.normalBias=.045;sun.shadow.bias=-.0003;this.scene.add(sun);
    const ground=this.box(this.scene,[180,.35,200],[0,-.4,-60],0x75ce80);ground.receiveShadow=true;
    const street=this.box(this.scene,[9.1,.18,190],[0,-.14,-60],0x8197ab);street.receiveShadow=true;
    for(const side of [-1,1]){
      this.box(this.scene,[2.7,.24,190],[side*5.9,-.08,-60],0xf1d4a0);
      this.box(this.scene,[.17,.25,190],[side*4.65,0,-60],0xfff4d8);
      this.box(this.scene,[.1,.02,190],[side*4.2,.005,-60],0xf9da7b);
    }
    for(let i=0;i<50;i++)for(const lane of [-1.5,1.5]){const mark=this.box(this.scene,[.085,.012,2.1],[lane,0,-i*4.5],0xecf1cf);this.laneMarks.push(mark);}
    for(let i=0;i<11;i++)for(const side of [-1,1]){
      const group=new T.Group();const z=-i*14;
      const colors=[0xf6b46f,0x58cbb8,0xf8dd8e,0xf29c9b,0x92a8e6];
      this.house(group,side,colors[(i+(side===1?2:0))%colors.length],i);
      group.position.set(side*11,0,z);this.scene.add(group);this.scenery.push({group,z});
      const tree=this.tree(i%2===0);tree.position.set(side*6.8,0,z-7);this.scene.add(tree);this.scenery.push({group:tree,z:z-7});
      if(i%2===0){const lamp=this.lamp();lamp.position.set(side*5.8,0,z-3);this.scene.add(lamp);this.scenery.push({group:lamp,z:z-3});}
    }
    for(let i=0;i<4;i++){const g=this.banner();g.position.z=-24-i*42;this.scene.add(g);this.bunting.push(g);}
    // Rounded distant hills and clouds establish a bright, readable horizon.
    for(let i=0;i<10;i++){const hill=this.ball(this.scene,[14,10+(i%3)*3,9],[(i-4.5)*20,0,-128],i%2?0x62cbb4:0x7cd4ad);hill.castShadow=false;}
    for(let i=0;i<8;i++){const cloud=new T.Group();for(let j=0;j<4;j++){const m=this.ball(cloud,[3.7,1.4+j%2,1.4],[(j-1.5)*3.1,j%2,0],0xffffff);m.castShadow=false;}cloud.position.set((i-3.5)*23,20+i%3*4,-85-(i%2)*20);this.scene.add(cloud);}
    this.runner=this.avatar(BLUE);this.friend=this.avatar(RED);this.scene.add(this.runner.root,this.friend.root);
    this.scene.add(this.obstaclesGroup);this.targetFlag=this.flag(RED);this.targetFlag.scale.setScalar(1.5);this.scene.add(this.targetFlag);
    for(let i=0;i<45;i++){const c=this.box(this.scene,[.11,.22,.035],[0,-10,0],[BLUE,RED,0xffd246,0xffffff,0x6ae0b4][i%5]);c.castShadow=false;this.confetti.push(c);}
    this.resize=new ResizeObserver(()=>this.fit());this.resize.observe(canvas);this.fit();
  }
  private mat(color:number){let m=this.materials.get(color);if(!m){m=new T.MeshStandardMaterial({color,roughness:.76});this.materials.set(color,m);}return m;}
  private mesh(parent:T.Object3D,geometry:T.BufferGeometry,size:number[],pos:number[],color:number){const m=new T.Mesh(geometry,this.mat(color));m.scale.set(size[0],size[1],size[2]);m.position.set(pos[0],pos[1],pos[2]);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  private box(parent:T.Object3D,size:number[],pos:number[],color:number,rounded=false){return this.mesh(parent,rounded?this.round:this.cube,size,pos,color);}
  private ball(parent:T.Object3D,size:number[],pos:number[],color:number){return this.mesh(parent,this.sphere,size,pos,color);}
  private rod(parent:T.Object3D,r:number,h:number,pos:number[],color:number){return this.mesh(parent,this.cylinder,[r,h,r],pos,color);}
  private tree(palm:boolean){const g=new T.Group();this.rod(g,.18,3.3,[0,1.65,0],0xba865a);
    if(palm){for(let i=0;i<7;i++){const a=i*Math.PI*2/7;const leaf=this.ball(g,[.53,.16,1.8],[Math.sin(a)*.9,3.6,Math.cos(a)*.9],i%2?0x319f67:0x4bbf69);leaf.rotation.set(-.25, a,0);}this.ball(g,[.45,.5,.45],[0,3.35,0],0x64c661);}
    else {this.ball(g,[1.2,1.4,1.1],[0,3.1,0],0x42b76c);this.ball(g,[.9,1,.9],[-.7,2.7,.25],0x60cf76);this.ball(g,[.8,1.05,.8],[.65,3,.2],0x7cd975);}
    this.box(g,[1.25,.32,1.25],[0,.08,0],0xf9e1ae,true);return g;
  }
  private house(g:T.Group,side:number,color:number,index:number){const height=4.4+(index%3)*1.6;
    this.box(g,[5.3,height,8],[0,height/2,0],color,true);
    this.box(g,[5.65,.35,8.3],[0,height+.08,0],0xfff2d7,true);
    this.box(g,[5.2,.3,7.9],[0,height+.33,0],index%2?0xe27f6b:0xc77654,true);
    for(let level=0;level<Math.floor(height/2);level++)for(const z of [-2.3,.0,2.3]){
      this.box(g,[.14,1.22,1.05],[-side*2.7,1.5+level*1.9,z],0xfff3dc,true);
      this.box(g,[.17,.96,.79],[-side*2.79,1.52+level*1.9,z],0x497a98,true);
      this.box(g,[.19,.04,.82],[-side*2.8,1.52+level*1.9,z],0xc5e7e4);
    }
    if(index%2===0){const awning=this.box(g,[1.7,.17,4.4],[-side*3.25,2.5,0],0xfff0d3);awning.rotation.z=side*.12;
      for(let j=0;j<5;j++){const stripe=this.box(g,[1.75,.18,.43],[-side*3.25,2.51,-1.8+j*.88],index%4===0?0xe97f69:0x3bbaae);stripe.rotation.z=side*.12;}
      this.box(g,[1.05,.6,1.6],[-side*3.35,.3,2.8],0xa06d4e,true);this.ball(g,[.64,.4,.8],[-side*3.35,.8,2.8],0x4caf67);
    }
  }
  private lamp(){const g=new T.Group();this.rod(g,.09,4.5,[0,2.25,0],0x427580);this.box(g,[.7,.15,.7],[0,4.54,0],0x315e6d,true);this.ball(g,[.28,.36,.28],[0,4.8,0],0xfff6c4);return g;}
  private banner(){const g=new T.Group();for(const side of [-1,1])this.rod(g,.09,7,[side*5.4,3.5,0],0xf4e0b2);
    this.box(g,[11,.045,.045],[0,6.7,0],0xf3e0b4);
    for(let i=0;i<13;i++){const c=this.mesh(g,this.cone,[.28,.65,.04],[-4.7+i*.78,6.37-Math.sin(i/12*Math.PI)*.6,0],[BLUE,0xffd257,RED,0x4fd0a5][i%4]);c.rotation.z=Math.PI;}
    return g;
  }
  private flag(color:number){const g=new T.Group();this.rod(g,.045,2.55,[0,1.27,0],0xfff4db);this.ball(g,[.085,.085,.085],[0,2.58,0],0xffce45);
    const cloth=this.box(g,[1.12,.7,.055],[.58,2.13,0],color);cloth.name='cloth';this.box(g,[.35,.3,.065],[.54,2.13,0],0xfff7dd);return g;
  }
  private avatar(color:number):Avatar {
    const root=new T.Group(),body=new T.Group();root.add(body);
    const shirt=this.box(body,[.88,.95,.57],[0,1.24,0],color,true);
    this.box(body,[.65,.22,.53],[0,.78,0],0x29435e,true);
    const skin=color===BLUE?0xe8ac80:0xa96948;
    this.rod(body,.14,.22,[0,1.8,0],skin);
    this.ball(body,[.45,.48,.39],[0,2.12,0],skin);
    this.ball(body,[.11,.16,.09],[-.44,2.08,.01],skin);this.ball(body,[.11,.16,.09],[.44,2.08,.01],skin);
    // Faces look toward -Z in game; the start-screen runners turn to face the camera.
    for(const side of [-1,1]){this.ball(body,[.08,.095,.04],[side*.16,2.18,-.36],0xffffff);this.ball(body,[.038,.053,.025],[side*.16,2.18,-.395],0x20324a);const brow=this.box(body,[.15,.035,.05],[side*.16,2.31,-.34],0x463333,true);brow.rotation.z=side*.13;}
    this.ball(body,[.095,.085,.10],[0,2.05,-.38],skin);this.box(body,[.15,.037,.026],[0,1.95,-.366],0x7e4235,true);
    this.ball(body,[.46,.28,.40],[0,2.38,.035],0x443130);
    const cap=this.ball(body,[.49,.25,.44],[0,2.43,0],color);this.box(body,[.57,.07,.39],[0,2.38,.38],color,true);
    this.box(body,[.18,.13,.045],[0,2.48,-.415],0xffe879,true);
    const pack=this.box(body,[.61,.68,.3],[0,1.35,.39],color===BLUE?0xffd34e:0x75e3cf,true);this.box(body,[.44,.28,.14],[0,1.2,.57],0xffe57a,true);
    for(const side of [-1,1])this.box(body,[.11,.76,.04],[side*.28,1.31,-.30],0xffe3a0,true);
    this.box(body,[.23,.24,.05],[0,1.32,-.32],0xfff7e2,true);
    const arms:T.Group[]=[],legs:T.Group[]=[];
    for(const side of [-1,1]){
      const arm=new T.Group();arm.position.set(side*.53,1.59,0);body.add(arm);
      this.ball(arm,[.19,.24,.2],[0,-.15,0],color);this.rod(arm,.135,.44,[0,-.41,0],skin);this.ball(arm,[.16,.19,.15],[0,-.65,-.02],skin);arms.push(arm);
      const leg=new T.Group();leg.position.set(side*.235,.79,0);body.add(leg);
      this.box(leg,[.33,.44,.4],[0,-.15,0],0x29435e,true);this.rod(leg,.125,.3,[0,-.47,0],skin);this.rod(leg,.14,.13,[0,-.60,0],0xfff4df);
      this.box(leg,[.36,.22,.61],[0,-.69,-.11],color,true);this.box(leg,[.38,.065,.64],[0,-.79,-.11],0xfff3d5,true);this.box(leg,[.23,.045,.18],[0,-.56,-.21],0xfff4df,true);legs.push(leg);
    }
    const flag=this.flag(color===BLUE?RED:BLUE);flag.position.set(.57,.64,.25);flag.scale.setScalar(.65);root.add(flag);flag.visible=false;
    return {root,body,arms,legs,flag,cap,shirt,pack};
  }
  private setTrack(seed:number,team:number){
    this.seed=seed;this.team=team;this.obstaclesGroup.clear();this.obstacleNodes=[];
    const color=team===0?RED:BLUE;
    for(const o of obstacles(seed)){const g=new T.Group();
      if(o.high){this.box(g,[1.8,2.6,1.3],[0,1.3,0],color,true);this.box(g,[1.9,.17,1.38],[0,2.55,0],0xfff0d1,true);this.box(g,[1.1,.12,.06],[0,1.45,.67],0xffe290);this.box(g,[.14,1.18,.065],[0,1.46,.68],0xffe290);this.box(g,[1.9,.14,1.4],[0,.1,0],0x344e66,true);}
      else {for(const side of [-1,1]){this.box(g,[.18,.84,.2],[side*.72,.42,0],0xf9ebca,true);this.box(g,[.45,.12,.8],[side*.72,.06,0],0x374f63,true);}this.box(g,[1.9,.55,.28],[0,.7,0],color,true);for(let i=0;i<4;i++){const stripe=this.box(g,[.17,.49,.3],[-.63+i*.42,.7,.01],0xfff3d8);stripe.rotation.z=-.4;}}
      g.position.x=(o.lane-1)*2.8;this.obstaclesGroup.add(g);this.obstacleNodes.push({group:g,d:o.d});
    }
  }
  private fit(){const {width,height}=this.canvas.getBoundingClientRect();if(width===this.width&&height===this.height)return;this.width=width;this.height=height;this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
  render(p:Runner,seed:number,team:number,time:number,mode:'lobby'|'waiting'|'playing'|'done',active:boolean){
    const dt=Math.min(.05,(time-this.lastTime)/1000||.016);this.lastTime=time;
    if(this.seed!==seed||this.team!==team)this.setTrack(seed,team);
    const lobby=mode==='lobby',small=this.width<700;
    const fieldOfView=small&&!lobby?66:48;
    if(this.camera.fov!==fieldOfView){this.camera.fov=fieldOfView;this.camera.updateProjectionMatrix();}
    if(p.hits!==this.lastHits||Math.abs(this.displayDistance-p.distance)>8||mode==='waiting'){this.displayDistance=p.distance;this.lastHits=p.hits;}else this.displayDistance=T.MathUtils.damp(this.displayDistance,p.distance,18,dt);
    const distance=lobby?0:this.displayDistance;
    for(const item of this.scenery)item.group.position.z=12-((12-item.z-distance)%154+154)%154;
    this.laneMarks.forEach((m,i)=>m.position.z=8-((Math.floor(i/2)*4.5-distance)%112.5+112.5)%112.5);
    this.bunting.forEach((g,i)=>g.position.z=12-((36+i*42-distance)%168+168)%168);
    for(const item of this.obstacleNodes){item.group.position.z=distance-item.d;item.group.visible=item.group.position.z<5&&item.group.position.z>-130;}
    this.obstaclesGroup.visible=!lobby;
    const target=p.distance<HALF?HALF:FINISH;this.targetFlag.position.set(0,0,-(target-distance));this.targetFlag.visible=!lobby&&target-distance<120;
    (this.targetFlag.getObjectByName('cloth') as T.Mesh).material=this.mat(p.distance<HALF?(team===0?RED:BLUE):(team===0?BLUE:RED));
    this.runner.root.visible=lobby||team===0;this.friend.root.visible=lobby||team===1;
    if(lobby){
      this.camera.position.set(small?0:4.2,small?3.8:4.5,small?10:11.5);this.camera.lookAt(small?0:-1.7,small?1.75:1.2,0);
      this.runner.root.position.set(small?-.7:.45,.1,small?-.3:0);this.friend.root.position.set(small?.8:2.15,.1,-.75);
      this.runner.root.rotation.y=2.85;this.friend.root.rotation.y=3.55;this.runner.root.scale.setScalar(small?1.15:1.35);this.friend.root.scale.setScalar(small?1.05:1.2);
      this.runner.flag.visible=true;this.friend.flag.visible=true;
      for(const [i,a] of [this.runner,this.friend].entries()){const t=this.motionReduced?0:time*.002+i;a.body.position.y=Math.sin(t)*.045;a.body.rotation.z=Math.sin(t*.6)*.025;a.arms[0].rotation.x=-.18;a.arms[1].rotation.x=-.35;a.arms[1].rotation.z=-.18;a.legs[0].rotation.x=.05;a.legs[1].rotation.x=-.05;}
    }else{
      const avatar=team===0?this.runner:this.friend;
      this.camera.position.lerp(new T.Vector3(0,small?5.5:5.2,small?12:10),1-Math.exp(-dt*7));this.camera.lookAt(0,1,-13);
      this.laneX=T.MathUtils.damp(this.laneX,(p.lane-1)*2.8,16,dt);
      const hop=p.jump>0?Math.sin(Math.PI*(1-p.jump/.82))*1.9:0;
      avatar.root.position.set(this.laneX,hop,0);avatar.root.rotation.y=-(this.laneX-(p.lane-1)*2.8)*.12;avatar.root.scale.setScalar(1);
      avatar.body.rotation.z=(this.laneX-(p.lane-1)*2.8)*.10;
      const t=active?time*.016:0,stride=Math.sin(t)*.85;
      avatar.body.position.y=active&&p.jump===0?Math.abs(Math.sin(t))*.08:0;
      avatar.arms.forEach((arm,i)=>{arm.rotation.x=p.jump>0?-1.1:stride*(i===0?1:-1);arm.rotation.z=i===0?.13:-.13;});
      avatar.legs.forEach((leg,i)=>leg.rotation.x=p.jump>0?(i===0?-.65:.6):stride*(i===0?-1:1));
      avatar.flag.visible=p.distance>=HALF;
      avatar.root.visible=p.stun===0||Math.floor(time/90)%2===0;

    }
    this.confetti.forEach((c,i)=>{c.visible=mode==='done';if(c.visible){const t=time*.0006;c.position.set(Math.sin(i*12.7)*5,7-((t+i*.19)%7),Math.cos(i*3.3)*5-1);c.rotation.set(t+i,t*2+i, t*.7);}});
    this.runner.flag.rotation.y=Math.sin(time*.004)*.08;this.friend.flag.rotation.y=Math.cos(time*.004)*.08;
    this.renderer.render(this.scene,this.camera);
  }
  dispose(){this.resize.disconnect();const geometries=new Set<T.BufferGeometry>();this.scene.traverse(o=>{if(o instanceof T.Mesh)geometries.add(o.geometry);});geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.renderer.dispose();}
}

