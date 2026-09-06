import { createDeviceViewer } from './device';

type Scene = {id: string; kicker: string; title: string; start: number; duration: number; captions: {start: number; end: number; text: string}[]};
type Timeline = {duration: number; scenes: Scene[]};
type FilmWindow = Window & {filmReady?: boolean; setFilmFrame?: (time: number) => Promise<void>; filmInfo?: unknown};
const host = window as FilmWindow;
const el = (name: string) => document.getElementById(name)!;
const viewer = await createDeviceViewer(el('cad') as HTMLCanvasElement,
  {variant: 'film', manual: true, pixelRatio: 1, reducedMotion: true});

const details: Record<string,string> = {
  overview: 'Actual Fusion CAD · animated around its mechanical axes',
  'contact-pads': 'Contact surfaces A / B · independent pivots',
  common: 'Same-direction tilt · a sustained directional cue',
  differential: 'Opposite-direction tilt · weight shift and inertia cues',
  gears: 'Motor gear → driven gear → contact surface',
  'spatial-four': 'Light pulses encode drive strength · vibration motion is not magnified',
  'shared-state': 'One illustrated state drives both the slow and fast cues',
  possibilities: 'Current content dynamics: a body x/y cross-section',
};
const smooth = (n: number) => {const v=Math.max(0,Math.min(1,n));return v*v*(3-2*v);};
const timeline: Timeline = await (await fetch('/__film/timeline.json')).json();

host.setFilmFrame = async (time: number) => {
  const scene = timeline.scenes.find(s => time >= s.start && time < s.start+s.duration) ?? timeline.scenes.at(-1)!;
  const local = time-scene.start;
  const fade = Math.min(smooth(local/.25), smooth((scene.duration-local)/.25));
  el('shade').style.opacity=String(1-fade);
  el('title').textContent=scene.title;el('kicker').textContent=scene.kicker;
  el('detail').textContent=details[scene.id];
  el('caption').textContent=scene.captions.find(c=>time>=c.start&&time<c.end)?.text??'';
  el('progress').style.width=`${Math.min(100,time/timeline.duration*100)}%`;
  el('state').style.display=scene.id==='shared-state'?'block':'none';
  el('materials').style.display=scene.id==='possibilities'?'block':'none';
  const cutaway=scene.id!=='overview'&&scene.id!=='possibilities';
  el('scope').textContent=scene.id==='possibilities'?'CAD INCLUDES OLDER CONTROLLER OUTLINE + ACTUATOR ENVELOPES':cutaway?'X-RAY VIEW · ACTUAL CAD · ILLUSTRATIVE COMMANDS':'ACTUAL CAD GEOMETRY · ILLUSTRATIVE COMMANDS';
  let left=0,right=0;
  const pulse:[number,number,number,number]=[0,0,0,0];
  let preset:'overview'|'contact'|'gears'|'spatial'='overview';
  if(scene.id==='overview'){left=right=Math.sin(local*.65)*3;}
  if(scene.id==='contact-pads'){
    preset='contact';
    const first=local<scene.duration/2;
    left=first?Math.sin(local*.9)*8:0;
    right=first?0:Math.sin((local-scene.duration/2)*.9)*8;
  }
  if(scene.id==='common'){preset='contact';left=right=Math.sin(local*.85)*9;}
  if(scene.id==='differential'){preset='contact';left=Math.sin(local*.85)*9;right=-left;}
  if(scene.id==='gears'){preset='gears';left=right=Math.sin(local*.62)*8;}
  if(scene.id==='spatial-four'){
    preset='spatial';
    for(let i=0;i<4;i++){
      const phase=(local/1.55-i+8)%4;
      pulse[i]=phase<.7?Math.sin(phase/.7*Math.PI):0;
    }
  }
  if(scene.id==='shared-state'){
    preset='spatial';
    const phase=local*.86;
    const content=Math.sin(phase);
    const collision=Math.pow(Math.max(0,(Math.abs(content)-.91)/.09),2);
    left=right=content*8;
    // The film shows temporal coupling without inventing a confirmed mapping
    // between the CAD node order and firmware wall/channel labels.
    pulse.fill(collision*.7);
    el('marble').style.transform=`translateX(${content*120}px)`;
    el('slow').style.width=`${Math.abs(content)*100}%`;
    el('fast').style.width=`${collision*100}%`;
  }
  if(scene.id==='possibilities'){
    left=right=Math.sin(local*.7)*6;
    pulse[0]=Math.pow(Math.max(0,Math.sin(local*1.7)),8)*.7;
    pulse[2]=Math.pow(Math.max(0,Math.sin(local*1.7-1)),8)*.5;
  }
  const camera=viewer.getCameraPreset(preset);
  viewer.renderFrame({leftDeg:left,rightDeg:right,pulse,cutaway,camera});
};
// The viewer owns asset loading. Rendering repeatedly during readiness is safe
// because all film motion is explicit and independent of wall-clock time.
await host.setFilmFrame(1);
host.filmReady=true;
host.filmInfo={duration:timeline.duration,scenes:timeline.scenes.map(s=>s.id),width:1920,height:1080,deterministic:true};
