import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export type MaterialKind = 'marble'|'water'|'sand';

// Intentionally a pedagogical two-dimensional model, not the firmware solver.
// x/y are simulated; depth is used only to make the illustration legible.
export class ContainerVisual {
  private renderer:THREE.WebGLRenderer;
  private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(33,1,.1,100);
  private assembly=new THREE.Group();
  private ball:THREE.Mesh;
  private water:THREE.Mesh;
  private sand:THREE.InstancedMesh;
  private trails:THREE.Mesh[]=[];
  private rings:THREE.Mesh[]=[];
  private discs:THREE.Mesh[]=[];
  private pulses=[0,0,0,0];
  private kind:MaterialKind='marble';
  private angle=0;
  private desiredAngle=0;
  private manual=false;
  private playing=true;
  private visible=true;
  private time=0;
  private lastTime=0;
  private x=-.62;
  private y=-.82;
  private vx=1.7;
  private vy=0;
  private kick=0;
  private wave=0;
  private waterSlope=0;
  private grainSeeds:{x:number;y:number;z:number;s:number}[]=[];
  private dummy=new THREE.Object3D();
  private renderRequested=true;
  public onAutoTilt?: (degrees:number)=>void;
  constructor(private canvas:HTMLCanvasElement,private reduced:boolean){
    this.playing=!reduced;
    this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.15;
    const pmrem=new THREE.PMREMGenerator(this.renderer);
    const room=new RoomEnvironment();
    this.scene.environment=pmrem.fromScene(room,.03).texture;
    room.dispose();pmrem.dispose();
    this.camera.position.set(3.3,2.0,7.8);this.camera.lookAt(0,0,0);
    this.scene.add(new THREE.HemisphereLight(0xdce8ff,0x34333c,2));
    const key=new THREE.DirectionalLight(0xffeee3,4);key.position.set(-3,5,4);this.scene.add(key);
    const rim=new THREE.DirectionalLight(0xbad5ff,3);rim.position.set(4,0,-3);this.scene.add(rim);
    this.scene.add(this.assembly);
    const frameMat=new THREE.MeshStandardMaterial({color:0xa9b1b9,metalness:.8,roughness:.27});
    const darkMat=new THREE.MeshStandardMaterial({color:0x3d4650,metalness:.7,roughness:.34});
    const addBeam=(w:number,h:number,d:number,x:number,y:number,z:number)=>{const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,3,.035),frameMat);mesh.position.set(x,y,z);this.assembly.add(mesh);};
    for(const z of [-.79,.79]){
      for(const y of [-1.22,1.22])addBeam(2.48,.105,.105,0,y,z);
      for(const x of [-1.19,1.19])addBeam(.105,2.46,.105,x,0,z);
    }
    for(const x of [-1.19,1.19])for(const y of [-1.22,1.22])addBeam(.105,.105,1.67,x,y,0);
    const glassMat=new THREE.MeshPhysicalMaterial({color:0xa3c9d2,metalness:.07,roughness:.13,transparent:true,opacity:.07,side:THREE.DoubleSide,depthWrite:false});
    const back=new THREE.Mesh(new THREE.PlaneGeometry(2.27,2.3),glassMat);back.position.z=-.78;this.assembly.add(back);
    for(const x of [-1.14,1.14]){const side=new THREE.Mesh(new THREE.PlaneGeometry(1.5,2.3),glassMat);side.position.x=x;side.rotation.y=Math.PI/2;this.assembly.add(side);}
    const bottom=new THREE.Mesh(new THREE.BoxGeometry(2.3,.045,1.5),new THREE.MeshStandardMaterial({color:0x5c6870,metalness:.65,roughness:.2,transparent:true,opacity:.6}));bottom.position.y=-1.15;this.assembly.add(bottom);
    const innerGrid=new THREE.GridHelper(2.25,9,0x7b929c,0x4c616b);innerGrid.position.y=-1.124;innerGrid.scale.z=.65;(innerGrid.material as THREE.Material).transparent=true;(innerGrid.material as THREE.Material).opacity=.27;this.assembly.add(innerGrid);
    const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.29,2.3,1.48)),new THREE.LineBasicMaterial({color:0xccdee7,transparent:true,opacity:.25}));this.assembly.add(outline);
    const positions=[[-1.27,0,0],[1.27,0,0],[0,1.3,0],[0,-1.3,0]];
    positions.forEach((p,i)=>{
      const transducer=new THREE.Mesh(new THREE.CylinderGeometry(.33,.33,.12,48),darkMat);transducer.position.set(p[0],p[1],p[2]);if(i<2)transducer.rotation.z=Math.PI/2;this.assembly.add(transducer);
      const discMat=new THREE.MeshStandardMaterial({color:0xdd6344,metalness:.5,roughness:.33,emissive:0xff3c10,emissiveIntensity:.07});
      const disc=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,.135,48),discMat);disc.position.copy(transducer.position);disc.rotation.copy(transducer.rotation);this.assembly.add(disc);this.discs.push(disc);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.4,.011,8,70),new THREE.MeshBasicMaterial({color:0xff673d,transparent:true,opacity:.2}));ring.position.set(p[0]*1.025,p[1]*1.025,.05);if(i<2)ring.rotation.y=Math.PI/2;else ring.rotation.x=Math.PI/2;this.assembly.add(ring);this.rings.push(ring);
    });
    this.ball=new THREE.Mesh(new THREE.SphereGeometry(.31,64,48),new THREE.MeshPhysicalMaterial({color:0xd0dbea,metalness:1,roughness:.12,clearcoat:1,clearcoatRoughness:.1}));this.assembly.add(this.ball);
    for(let i=0;i<9;i++){const trail=new THREE.Mesh(new THREE.SphereGeometry(.026,8,6),new THREE.MeshBasicMaterial({color:0xa6c5d4,transparent:true,opacity:(9-i)/40}));trail.position.set(-.7+i*.1,-.8,0);this.trails.push(trail);this.assembly.add(trail);}
    this.water=new THREE.Mesh(new THREE.BoxGeometry(2.23,1.1,1.42,48,1,8),new THREE.MeshPhysicalMaterial({color:0x4aafc4,metalness:.32,roughness:.17,transparent:true,opacity:.86,clearcoat:1,side:THREE.DoubleSide}));this.water.position.y=-.55;this.assembly.add(this.water);
    const grainMaterial=new THREE.MeshStandardMaterial({color:0xd4a56e,metalness:.12,roughness:.8});
    this.sand=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.037,0),grainMaterial,850);this.assembly.add(this.sand);
    // Fixed seeds avoid discontinuous particle placement on every frame.
    let seed=43;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<850;i++){this.grainSeeds.push({x:(random()-.5)*2.12,y:random(),z:(random()-.5)*1.35,s:.6+random()*.7});this.sand.setColorAt(i,new THREE.Color().setHSL(.095+random()*.025,.3+random()*.2,.36+random()*.3));}
    this.setMaterial('marble');
    const resize=()=>{const {width,height}=canvas.getBoundingClientRect();if(!width||!height)return;this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.position.set(3.3,2,7.8);if(width/height<1.1)this.camera.position.multiplyScalar(1.06);this.camera.updateProjectionMatrix();this.renderRequested=true;};
    new ResizeObserver(resize).observe(canvas);resize();
    new IntersectionObserver(([entry])=>{this.visible=entry.isIntersecting;this.renderRequested=true;},{rootMargin:'80px'}).observe(canvas);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();const fallback=document.querySelector<HTMLElement>('.scene-fallback');if(fallback)fallback.hidden=false;});
    this.tick(0);
  }
  setPlaying(value:boolean){this.playing=value;this.renderRequested=true;}
  setTilt(degrees:number){this.desiredAngle=degrees*Math.PI/180;this.manual=true;this.renderRequested=true; if(!this.playing){this.angle=this.desiredAngle;this.x=Math.sin(this.angle)*.8;this.y=-.82;this.wave=.08;}}
  shake(){this.kick=1;this.vx+=this.x>0?-4.5:4.5;this.vy=3;this.wave=.45;this.renderRequested=true;}
  setMaterial(kind:MaterialKind){this.kind=kind;this.ball.visible=kind==='marble';this.water.visible=kind==='water';this.sand.visible=kind==='sand';this.trails.forEach(t=>t.visible=kind==='marble');this.wave=.17;this.renderRequested=true;this.pulses.fill(0);}
  private tick=(stamp:number)=>{
    requestAnimationFrame(this.tick);
    const dt=Math.min((stamp-this.lastTime)/1000,.034);this.lastTime=stamp;
    if(!this.visible||document.hidden)return;
    if(!this.playing&&!this.renderRequested)return;
    if(this.playing){
      this.time+=dt;
      const target=this.manual?this.desiredAngle:Math.sin(this.time*.83)*.27;
      const previous=this.angle;
      this.angle=THREE.MathUtils.damp(this.angle,target,6,dt);
      if(!this.manual)this.onAutoTilt?.(this.angle*180/Math.PI);
      this.wave=Math.min(.4,this.wave+Math.abs(this.angle-previous)*.8);
      this.kick=Math.max(0,this.kick-dt*.9);
      this.vx+=Math.sin(this.angle)*7.2*dt+Math.sin(this.time*32)*this.kick*dt*24;
      this.vy-=8*dt;
      this.vx*=Math.exp(-dt*.22);
      this.x+=this.vx*dt;this.y+=this.vy*dt;
      const bounce=(index:number,speed:number)=>{if(Math.abs(speed)<.35)return;this.pulses[index]=Math.max(this.pulses[index],Math.min(1,Math.abs(speed)*.45));this.wave=Math.max(this.wave,Math.min(.35,Math.abs(speed)*.09));};
      if(this.x>.8){bounce(1,this.vx);this.x=.8;this.vx=-Math.abs(this.vx)*.67;}if(this.x<-.8){bounce(0,this.vx);this.x=-.8;this.vx=Math.abs(this.vx)*.67;}
      if(this.y<-.81){if(this.vy<-.3)bounce(3,this.vy);this.y=-.81;this.vy=Math.abs(this.vy)>.6?-this.vy*.42:0;}if(this.y>.8){bounce(2,this.vy);this.y=.8;this.vy=-Math.abs(this.vy)*.5;}
      this.wave*=Math.exp(-dt*.65);
    }
    this.assembly.rotation.set(.04,-.1,-this.angle);
    this.ball.position.set(this.x,this.y,.12);this.ball.rotation.z=-this.x*2;
    this.trails.forEach((t,i)=>{t.position.x=THREE.MathUtils.clamp(this.x-this.vx*(i+1)*.045,-.9,.9);t.position.y=this.y+.005;t.position.z=.12;});
    const slopeTarget=Math.tan(this.angle);
    this.waterSlope=this.playing?THREE.MathUtils.damp(this.waterSlope,slopeTarget,2.8,dt):slopeTarget;
    if(this.kind==='water'){
      const pos=this.water.geometry.attributes.position;
      for(let i=0;i<pos.count;i++){const x=pos.getX(i);const base=pos.getY(i)>-.5; // top row and top vertices only
        if(base){pos.setY(i,THREE.MathUtils.clamp(.55+x*this.waterSlope+Math.sin(x*3.5+this.time*4)*this.wave,.07,1.42));}}
      pos.needsUpdate=true;this.water.geometry.computeVertexNormals();
      if(this.playing&&this.wave>.008){const side=this.angle>0?1:0;this.pulses[side]=Math.max(this.pulses[side],Math.abs(Math.sin(this.time*5))*this.wave*2);}
    }
    if(this.kind==='sand'){
      this.grainSeeds.forEach((g,i)=>{const pileHeight=.66-Math.abs(g.x-this.waterSlope*.8)*.22+g.x*this.waterSlope*.6;this.dummy.position.set(g.x,-1.06+g.y*Math.max(.1,pileHeight),g.z);if(this.playing)this.dummy.position.y+=Math.sin(this.time*8+i)*this.kick*.07;this.dummy.scale.setScalar(g.s);this.dummy.rotation.set(i*.5,i*.8,i*.3);this.dummy.updateMatrix();this.sand.setMatrixAt(i,this.dummy.matrix);});this.sand.instanceMatrix.needsUpdate=true;
      if(this.playing&&this.wave>.008)this.pulses[this.angle>0?1:0]=Math.abs(Math.sin(this.time*12))*this.wave*2;
    }
    this.pulses.forEach((p,i)=>{const material=this.rings[i].material as THREE.MeshBasicMaterial;material.opacity=.13+p*.87;this.rings[i].scale.setScalar(1+(1-p)*.3);(this.discs[i].material as THREE.MeshStandardMaterial).emissiveIntensity=.07+p*1.1;if(this.playing)this.pulses[i]*=Math.exp(-dt*5);});
    this.renderer.render(this.scene,this.camera);this.renderRequested=false;
  }
}
