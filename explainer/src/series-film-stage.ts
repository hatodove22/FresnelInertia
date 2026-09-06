import {createSeriesViewer} from './seriesDevice';
import {bottleWidth,seriesIllustrationState,type SeriesIllustrationState} from './seriesFilmModel';

type Scene={id:string;title:string;kicker:string;start:number;duration:number;captions:{start:number;end:number;text:string}[]};
type Source={label:string;venue:string;title:string;url:string};
type Timeline={duration:number;research_status:string;scenes:Scene[];sources:Source[]};
type FilmHost=Window&{seriesFilmReady?:boolean;setSeriesFilmFrame?:(time:number)=>Promise<void>;getSeriesFilmState?:(time:number)=>SeriesIllustrationState};
const host=window as FilmHost,el=(id:string)=>document.getElementById(id)!;
const timeline:Timeline=await(await fetch('/__series-film/timeline.json')).json();
const viewer=await createSeriesViewer(el('cad') as HTMLCanvasElement,{manual:true,pixelRatio:1});
const graphic=el('illustration') as HTMLCanvasElement;
const ctx=graphic.getContext('2d')!;
const colors={ink:'#f3efe7',muted:'#a9b9cb',line:'#738599',orange:'#ffad78',aqua:'#85dbd0',skin:'#ead3b7',red:'#ff7771'};
const rad=(v:number)=>v*Math.PI/180;
const label=(text:string,x:number,y:number,size=24,color=colors.ink,align:CanvasTextAlign='left')=>{
  ctx.fillStyle=color;ctx.font=`${size}px "Segoe UI",Arial`;ctx.textAlign=align;ctx.fillText(text,x,y);
};
const line=(x1:number,y1:number,x2:number,y2:number,color=colors.line,width=2)=>{
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
};
const arrow=(x1:number,y1:number,x2:number,y2:number,color=colors.aqua,width=3)=>{
  line(x1,y1,x2,y2,color,width);const a=Math.atan2(y2-y1,x2-x1);
  line(x2,y2,x2-12*Math.cos(a-.5),y2-12*Math.sin(a-.5),color,width);
  line(x2,y2,x2-12*Math.cos(a+.5),y2-12*Math.sin(a+.5),color,width);
};
function bottlePath(indentation:number){
  ctx.beginPath();
  for(let y=-210;y<=190;y+=4){const x=bottleWidth(y,indentation,1);if(y===-210)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
  ctx.quadraticCurveTo(86,205,62,205);ctx.lineTo(-62,205);ctx.quadraticCurveTo(-90,205,-90,185);
  for(let y=184;y>=-210;y-=4)ctx.lineTo(-bottleWidth(y,0,-1),y);
  ctx.closePath();
}
function finger(id:string,x:number,y:number,side:number,angle:number,active=false){
  ctx.save();ctx.translate(x,y);ctx.rotate(-rad(angle));
  ctx.fillStyle=colors.skin;ctx.globalAlpha=.8;
  ctx.beginPath();ctx.roundRect(side<0?-112:8,-26,104,52,25);ctx.fill();
  ctx.globalAlpha=1;
  ctx.strokeStyle='#8f7f70';ctx.lineWidth=1;
  ctx.beginPath();ctx.ellipse(side*35,-3,18,15,0,0,Math.PI*2);ctx.stroke();
  line(0,-32,0,32,active?'#ffe5a7':colors.orange,active?8:6);
  ctx.restore();
  label(id,x+side*140,y+8,22,active?'#ffe5a7':colors.muted,side<0?'right':'left');
}
function forceBar(force:number){
  label('GRIP INPUT',64,440,21,colors.muted);
  ctx.fillStyle='#263241';ctx.fillRect(65,458,200,10);
  ctx.fillStyle=colors.aqua;ctx.fillRect(65,458,200*force,10);
  label('same input scale',65,496,21,colors.muted);
}
function drawTimeline(local:number){
  const items=[['2024','Shape'],['2025','Coherence'],['2025','Deformation'],['2025','Weight / inertia'],['2026','FresnelShape']];
  const active=Math.min(items.length-1,Math.floor(local/4));
  line(102,62,102,445,'#384857',4);
  items.forEach(([year,title],i)=>{
    const y=64+i*91;ctx.fillStyle=i===active?colors.orange:'#617284';ctx.beginPath();ctx.arc(102,y,7,0,Math.PI*2);ctx.fill();
    label(year,138,y+7,23,colors.aqua);label(title,247,y+7,28,i===active?colors.ink:colors.muted);
  });
  label('Overlapping research branches',65,514,22,colors.muted);
}
function drawIllustration(s:SeriesIllustrationState){
  ctx.clearRect(0,0,900,528);
  if(s.id==='series'){drawTimeline(s.local);return;}
  if(s.id==='sources')return;
  const shakeX=s.bodyOffsetMeters[0]*4100,shakeY=-s.bodyOffsetMeters[1]*4100;
  const centerX=438+shakeX,centerY=250+shakeY;
  ctx.save();ctx.translate(centerX,centerY);ctx.rotate(-rad(s.bodyTiltDeg));
  bottlePath(s.indentation);ctx.fillStyle='#203a46';ctx.fill();ctx.strokeStyle=colors.aqua;ctx.lineWidth=3;ctx.stroke();
  ctx.fillStyle='#2d4e5b';ctx.fillRect(-65,-229,130,18);ctx.strokeStyle=colors.aqua;ctx.strokeRect(-65,-229,130,18);
  if(s.id==='stiffness'){
    ctx.save();bottlePath(s.indentation);ctx.clip();ctx.fillStyle='#78d8c01d';ctx.fillRect(-120,-100,240,200);ctx.restore();
    ctx.setLineDash([6,7]);line(90,-96,90,102,'#6b8190',1.5);ctx.setLineDash([]);
  }
  const ys={A:s.graspY,B:s.graspY-80,C:s.graspY+75};
  for(const id of ['A','B','C'] as const){
    const side=id==='A'?-1:1,y=ys[id],x=side*bottleWidth(y,s.indentation,side);
    finger(`${id} · ${id==='A'?'thumb':id==='B'?'index':'middle'}`,x,y,side,s.angles[id],s.active===id);
  }
  if(s.id==='center-of-gravity'||s.id==='inertia'){
    ctx.fillStyle=colors.red;ctx.beginPath();ctx.arc(0,114,11,0,Math.PI*2);ctx.fill();
    ctx.setLineDash([5,5]);line(0,0,0,100,'#98a3b2',2);ctx.setLineDash([]);
    line(-10,0,10,0,colors.muted,2);line(0,-10,0,10,colors.muted,2);
  }
  ctx.restore();
  if(s.id==='principle'){
    label('Global shape comes from the image',40,485,25,colors.muted);
    label('Local orange lines are the contact planes',40,519,24,colors.orange);
  }
  if(s.id==='mechanism'){
    label('Only the highlighted plane turns',45,486,26,colors.orange);
    label('Finger assignment illustrates the WHC grip',45,520,22,colors.muted);
  }
  if(s.id==='shape'){
    arrow(846,205,846,325,colors.aqua,3);arrow(846,205,846,140,colors.aqua,3);
    label('grasp height',720,88,21,colors.muted);
    label('Local slope changes along the shoulder',40,506,25,colors.orange);
  }
  if(s.id==='stiffness'){
    forceBar(s.force);label(s.soft?'SOFTER REGION':'FIRMER RESPONSE',576,461,24,colors.aqua);
    label('virtual deformation',576,494,22,colors.muted);
  }
  if(s.id==='center-of-gravity'){
    const x=centerX+114*Math.sin(rad(s.bodyTiltDeg)),y=centerY+114*Math.cos(rad(s.bodyTiltDeg));
    arrow(x,y+17,x,y+89,colors.red,4);
    label('gravity',x+22,y+83,23,colors.red);
    label('Virtual center of gravity',50,493,26,colors.red);
    label('A held tilt keeps a sustained cue',50,524,23,colors.muted);
  }
  if(s.id==='inertia'){
    const a=s.acceleration;
    if(Math.abs(a)>.06){
      const x=centerX,y=centerY+114;
      arrow(x,y,s.axis==='x'?x+86*a:x,s.axis==='y'?y-86*a:y,colors.red,4);
    }
    label('ACCELERATION',58,471,23,colors.red);
    label(s.axis==='x'?'horizontal':'vertical',58,505,25,colors.muted);
    line(304,485,727,485,'#435363',1.5);
    ctx.beginPath();ctx.strokeStyle=colors.red;ctx.lineWidth=2.5;
    const currentPhase=(s.axis==='x'?s.local:s.local-s.duration*.5)/(s.duration*.5)*Math.PI*4;
    for(let x=0;x<=420;x++){
      const wave=Math.sin(currentPhase+(x-420)/67),acceleration=2*wave-3*wave**3;
      const y=485-20*acceleration;if(x===0)ctx.moveTo(304+x,y);else ctx.lineTo(304+x,y);
    }ctx.stroke();
  }
}

const sceneAt=(time:number)=>timeline.scenes.find(s=>time>=s.start&&time<s.start+s.duration)??timeline.scenes.at(-1)!;
host.getSeriesFilmState=(time:number)=>{const scene=sceneAt(time);return seriesIllustrationState(scene.id,time-scene.start,scene.duration);};
host.setSeriesFilmFrame=async(time:number)=>{
  const scene=sceneAt(time),local=time-scene.start,s=host.getSeriesFilmState!(time);
  el('kicker').textContent=scene.kicker;el('title').textContent=scene.title;
  el('caption').textContent=scene.captions.find(c=>time>=c.start&&time<c.end)?.text??'';
  el('input').textContent=s.input;el('output').textContent=s.output;
  el('progress').style.width=`${time/timeline.duration*100}%`;
  el('scope-left').textContent=timeline.research_status==='approved'?'ILLUSTRATIVE INPUTS & CONTACT-PLANE COMMANDS':'DRAFT COMPOSITION · SOURCE REVIEW PENDING';
  el('illustration').style.display=scene.id==='sources'?'none':'block';
  el('sources').style.display=scene.id==='sources'?'block':'none';
  el('virtual-label').textContent=scene.id==='sources'?'PRIMARY PUBLICATIONS · LINKS IN THE TRANSCRIPT':scene.id==='series'?'RESEARCH THROUGH TIME':'VIRTUAL OBJECT & FINGERTIP CONTACT';
  if(scene.id==='sources'){
    el('sources').innerHTML=timeline.sources.map(source=>`<div class="source">${source.label}<small>${source.venue}</small></div>`).join('');
    el('input').textContent='Research concepts · evidence differs by study';
    el('output').textContent='One CAD model illustrates the series';
  }
  drawIllustration(s);
  const preset=scene.id==='sources'||scene.id==='series'?'overview':'contact';
  const camera=viewer.getCameraPreset(preset);
  camera.position=camera.position.map((v,i)=>(camera.target?.[i]??0)+(v-(camera.target?.[i]??0))/1.35) as [number,number,number];
  viewer.renderFrame({angles:s.angles,cutaway:scene.id!=='sources'&&scene.id!=='series',
    bodyTiltDeg:s.bodyTiltDeg,bodyOffsetMeters:s.bodyOffsetMeters,
    showFingertips:scene.id!=='sources',camera});
  const markers=viewer.getContactMarkers();
  el('contact-markers').innerHTML=markers.filter(m=>m.visible).map(m=>`<g transform="translate(${m.x*900},${m.y*548})"><circle r="8" fill="#ffbf93" stroke="#101319" stroke-width="2"/><text x="15" y="-12" font-size="24" font-family="Segoe UI" fill="#ffdcc3" stroke="#101319" stroke-width="4" paint-order="stroke">${m.id}</text></g>`).join('');
  const fade=Math.min(1,Math.max(0,local/.25),Math.max(0,(scene.duration-local)/.25));
  el('shade').style.opacity=String(1-fade);
};
await host.setSeriesFilmFrame(1);
host.seriesFilmReady=true;
