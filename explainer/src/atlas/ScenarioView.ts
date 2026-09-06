import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { projectCues, type SketchFrame } from './scenarioModel';

/** A render-only consumer of SketchFrame. The controller owns time and inputs. */
export class ScenarioView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
  private assembly = new THREE.Group();
  private orb: THREE.Mesh;
  private eyes = new THREE.Group();
  private grains: THREE.InstancedMesh;
  private grainBed: THREE.Mesh;
  private bedTop: boolean[];
  private stream: THREE.InstancedMesh;
  private orbit: THREE.Mesh;
  private rings: THREE.Mesh[] = [];
  private pads: THREE.Mesh[] = [];
  private dummy = new THREE.Object3D();
  private seeds: {x:number;y:number;z:number}[] = [];
  private environment: THREE.WebGLRenderTarget;
  private resizeObserver: ResizeObserver;
  private frame?: SketchFrame;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    const pmrem = new THREE.PMREMGenerator(this.renderer), room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, .04);
    this.scene.environment = this.environment.texture;
    room.dispose(); pmrem.dispose();
    this.camera.position.set(3.2, 2.4, 8.4); this.camera.lookAt(0, -.2, 0);
    this.scene.add(new THREE.HemisphereLight(0xc5e6ff, 0x313041, 2));
    const key = new THREE.DirectionalLight(0xffdec4, 4); key.position.set(-3, 4, 4); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6ef0d4, 3); rim.position.set(3, 2, -3); this.scene.add(rim);
    this.scene.add(this.assembly);
    const metal = new THREE.MeshStandardMaterial({ color: 0x849393, metalness: .75, roughness: .3 });
    const beam = (w:number,h:number,d:number,x:number,y:number,z:number) => {
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(w,h,d,3,.025), metal);
      mesh.position.set(x,y,z); this.assembly.add(mesh);
    };
    for (const z of [-.72,.72]) {
      for (const x of [-1.15,1.15]) beam(.07,2.28,.07,x,0,z);
      for (const y of [-1.12,1.12]) beam(2.36,.07,.07,0,y,z);
    }
    for (const x of [-1.15,1.15]) for (const y of [-1.12,1.12]) beam(.07,.07,1.48,x,y,0);
    const glass = new THREE.MeshPhysicalMaterial({color:0x6bad9e, transparent:true, opacity:.09, metalness:.12, roughness:.15, side:THREE.DoubleSide, depthWrite:false});
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2.26,2.2),glass); back.position.z=-.72; this.assembly.add(back);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(2.25,.03,1.4),new THREE.MeshStandardMaterial({color:0x243c39,metalness:.5,roughness:.32})); floor.position.y=-1.09; this.assembly.add(floor);
    const grid = new THREE.GridHelper(2.22,12,0x65bbaa,0x314940); grid.position.y=-1.07; grid.scale.z=.62; this.assembly.add(grid);
    const places = [[-1.22,0,0],[1.22,0,0],[0,1.19,0],[0,-1.2,0]];
    places.forEach((p,i)=>{
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,.09,40),new THREE.MeshStandardMaterial({color:0x61cbb5,metalness:.5,roughness:.3,emissive:0x33aa99,emissiveIntensity:.1}));
      pad.position.set(...p as [number,number,number]); if(i<2)pad.rotation.z=Math.PI/2;
      this.assembly.add(pad);this.pads.push(pad);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.32,.012,8,60),new THREE.MeshBasicMaterial({color:0x87f4d7,transparent:true,opacity:.2}));
      ring.position.copy(pad.position);if(i<2)ring.rotation.y=Math.PI/2;else ring.rotation.x=Math.PI/2;
      this.assembly.add(ring);this.rings.push(ring);
    });
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(.27,48,32),new THREE.MeshPhysicalMaterial({color:0xff9b58,metalness:.85,roughness:.16,clearcoat:1}));
    this.assembly.add(this.orb);
    for(const x of [-.085,.085]){ const eye = new THREE.Mesh(new THREE.SphereGeometry(.047,16,12),new THREE.MeshBasicMaterial({color:0x172521}));eye.position.set(x,.035,.245);this.eyes.add(eye); }
    this.assembly.add(this.eyes);
    this.orbit = new THREE.Mesh(new THREE.TorusGeometry(.42,.008,6,80),new THREE.MeshBasicMaterial({color:0xffae66,transparent:true,opacity:.5}));this.assembly.add(this.orbit);
    this.grains = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.045,0),new THREE.MeshStandardMaterial({color:0xf4b566,roughness:.45,metalness:.3}),180); this.assembly.add(this.grains);
    this.grainBed=new THREE.Mesh(new THREE.BoxGeometry(2.17,1,1.31,24,1,10),new THREE.MeshStandardMaterial({color:0xc49a65,roughness:.95,metalness:.03}));
    this.grainBed.position.y=-1.06;this.assembly.add(this.grainBed);
    const bedPositions=this.grainBed.geometry.attributes.position;
    this.bedTop=Array.from({length:bedPositions.count},(_,i)=>bedPositions.getY(i)>0);
    this.stream=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.029,0),new THREE.MeshStandardMaterial({color:0xffc67c,roughness:.6}),24);this.assembly.add(this.stream);
    let seed=73;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<180;i++)this.seeds.push({x:(random()-.5)*2,y:random(),z:(random()-.5)*1.2});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
  }
  private resize(){
    if(this.disposed)return;
    const {width,height}=this.canvas.getBoundingClientRect();if(!width||!height)return;
    this.renderer.setSize(width,height,false);this.camera.aspect=width/height;
    this.camera.position.set(3.2,2.4,8.4);if(width/height<1.05)this.camera.position.multiplyScalar(1.17);
    this.camera.lookAt(0,-.2,0);this.camera.updateProjectionMatrix();if(this.frame)this.render(this.frame);
  }
  render(frame:SketchFrame){
    if(this.disposed)return;this.frame=frame;
    const cues=projectCues(frame),isPour=frame.scenario==='pour',isSeed=frame.scenario==='seed';
    this.assembly.rotation.set(.02,-.1,-frame.tilt);
    this.orb.visible=!isPour;this.eyes.visible=isSeed;this.grains.visible=isPour;this.grainBed.visible=isPour&&frame.remaining>0;this.stream.visible=isPour&&frame.remaining>0&&Math.abs(frame.tilt)>.3;this.orbit.visible=!isPour;
    this.orb.position.set(frame.x,-.77+(isSeed?Math.abs(Math.sin(frame.time*2.2))*.1*frame.arousal:0),.06);
    const material=this.orb.material as THREE.MeshPhysicalMaterial;
    material.color.setHex(isSeed?0x91d2a2:0xffa45e);material.metalness=isSeed?.2:.85;
    this.orb.scale.setScalar(isSeed?1+Math.sin(frame.time*3)*.045*frame.arousal:1);
    this.eyes.position.copy(this.orb.position);this.orbit.position.copy(this.orb.position);this.orbit.position.z+=.04;
    this.orbit.scale.setScalar(frame.attached?1.3:1);(this.orbit.material as THREE.MeshBasicMaterial).opacity=frame.attached?.7:.18;
    if(isPour){
      const count=Math.ceil(frame.remaining*180);this.grains.count=count;
      const surface=(x:number)=>Math.max(.012,(.06+frame.remaining*.49)*(1-Math.abs(x)*.13)+x*Math.sin(frame.tilt)*.2);
      const positions=this.grainBed.geometry.attributes.position;
      for(let i=0;i<positions.count;i++)positions.setY(i,this.bedTop[i]?surface(positions.getX(i)):0);
      positions.needsUpdate=true;this.grainBed.geometry.computeVertexNormals();
      this.seeds.slice(0,count).forEach((g,i)=>{
        this.dummy.position.set(g.x,-1.035+surface(g.x)+g.y*.018,g.z);
        this.dummy.rotation.set(i*.3,i*.7,i*.5);this.dummy.scale.setScalar(.5+(i%7)*.065);this.dummy.updateMatrix();this.grains.setMatrixAt(i,this.dummy.matrix);
      });this.grains.instanceMatrix.needsUpdate=true;
      const side=frame.tilt>=0?1:-1;this.stream.count=Math.ceil(frame.remaining*24);
      for(let i=0;i<this.stream.count;i++){
        const phase=(frame.time*1.8+i*.618)%1;
        this.dummy.position.set(side*(1.12+phase*.85),-1.04+surface(side)-phase*phase*.5,(i%3-1)*.06);
        this.dummy.scale.setScalar(.8);this.dummy.rotation.set(i,frame.time+i,0);this.dummy.updateMatrix();this.stream.setMatrixAt(i,this.dummy.matrix);
      }this.stream.instanceMatrix.needsUpdate=true;
    }
    cues.fast.forEach((p,i)=>{
      (this.pads[i].material as THREE.MeshStandardMaterial).emissiveIntensity=.08+p*2;
      (this.rings[i].material as THREE.MeshBasicMaterial).opacity=.12+p*.85;this.rings[i].scale.setScalar(1+(1-p)*.4);
    });
    this.renderer.render(this.scene,this.camera);
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.resizeObserver.disconnect();
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    this.scene.traverse(object=>{const renderable=object as THREE.Mesh;if(renderable.geometry)geometries.add(renderable.geometry);if(renderable.material)for(const m of Array.isArray(renderable.material)?renderable.material:[renderable.material])materials.add(m);});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.grains.dispose();this.stream.dispose();this.environment.dispose();this.renderer.dispose();
  }
}
