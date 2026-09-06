/** Deterministic explanatory poses. These are not a hardware controller or
 * reconstructed study stimuli. A/B/C follow the film's illustrated grip;
 * amplitudes and timing are deliberately illustrative and bounded to ±10°. */
export interface SeriesIllustrationState {
  id: string; local: number; progress: number; duration:number;
  angles: {A:number;B:number;C:number};
  bodyTiltDeg: number; bodyOffsetMeters: [number,number,number];
  force: number; indentation: number; soft: boolean; graspY: number;
  acceleration: number; axis: 'x'|'y'; active: string;
  input: string; output: string;
}
const clamp=(v:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,v));
const smooth=(v:number)=>{const x=clamp(v,0,1);return x*x*(3-2*x);};
export const bottleWidth=(y:number,indentation=0,side=1)=>{
  const shoulder=65+25*smooth((y+210)/215);
  return shoulder-(side>0?indentation*Math.exp(-(((y-5)/95)**2)):0);
};
export const bottleTangent=(y:number,indentation=0,side=1)=>{
  const slope=side*(bottleWidth(y+.1,indentation,side)-bottleWidth(y-.1,indentation,side))/.2;
  return Math.atan(slope)*180/Math.PI;
};

export function seriesIllustrationState(id:string,local:number,duration:number):SeriesIllustrationState {
  const p=clamp(local/duration,0,1),phase=local*.72;
  const s:SeriesIllustrationState={id,local,progress:p,duration,angles:{A:0,B:0,C:0},
    bodyTiltDeg:0,bodyOffsetMeters:[0,0,0],force:0,indentation:0,soft:false,
    graspY:0,acceleration:0,axis:'x',active:'',input:'',output:'Local contact-plane orientation'};
  if(id==='principle'||id==='shape'){
    s.graspY=55*Math.sin(local*.31);
    s.angles={A:bottleTangent(s.graspY,0,-1),B:bottleTangent(s.graspY-80),C:bottleTangent(s.graspY+75)};
    s.input=id==='shape'?'GRASP · choose a contact location':'LOCAL TOUCH · surface direction at each fingertip';
    s.output='The planes follow the local tangent directions';
  }
  if(id==='mechanism'){
    s.active=['A','B','C'][Math.floor(local/3.5)%3];
    s.angles[s.active as 'A'|'B'|'C']=Math.sin((local%3.5)/3.5*Math.PI*2)*8;
    s.input='Illustrated grip · thumb / index / middle';
    s.output='Three independent contact-plane pivots';
  }
  if(id==='stiffness'){
    s.force=.5-.5*Math.cos(phase);
    s.soft=p>.3;
    s.indentation=s.force*(s.soft?19:5);
    s.angles={A:0,B:bottleTangent(-80,s.indentation),C:bottleTangent(75,s.indentation)};
    // This chapter illustrates the study's fixed thumb and changing right
    // contour normals, not a calibrated reproduction of its gains or forces.
    s.input=`SQUEEZE · ${s.soft?'softer':'firmer'} illustrated response`;
    s.output='Thumb fixed · index and middle follow deformation';
  }
  if(id==='center-of-gravity'){
    const theta=p<.23?-22*smooth(p/.23):p<.4?-22:p<.66?-22+44*smooth((p-.4)/.26):p<.82?22:22*(1-smooth((p-.82)/.18));
    const addition=7*Math.sin(theta*Math.PI/180)/Math.sin(22*Math.PI/180);
    s.bodyTiltDeg=theta;s.angles={A:addition,B:2+addition,C:-2+addition};
    s.input='TILT · hold an orientation';
    s.output='A sustained cue added to the shape orientation';
  }
  if(id==='inertia'){
    s.axis=p<.5?'x':'y';
    const t=p<.5?local:local-duration*.5;
    // Two complete sin³ cycles settle position, velocity and acceleration to
    // zero at both ends. Horizontal and vertical gestures therefore join
    // without a position jump or an invented impulse. The normalized second
    // derivative is 2 sin(phase) - 3 sin³(phase), not an unrelated pulse clock.
    const phase=t/(duration*.5)*Math.PI*4,wave=Math.sin(phase);
    const travel=wave**3,a=2*wave-3*wave**3;
    s.acceleration=a;
    s.bodyOffsetMeters=s.axis==='x'?[travel*.008,0,0]:[0,travel*.008,0];
    const addition=a*7;
    s.angles=s.axis==='x'?{A:addition,B:2+addition,C:-2+addition}:{A:-addition,B:2+addition,C:-2+addition};
    s.input=s.axis==='x'?'SHAKE · back and forth':'SHAKE · up and down';
    s.output='Acceleration-dependent cue added to shape';
  }
  if(id==='series'||id==='sources'){
    const a=Math.sin(local*.45)*3;
    s.angles={A:a,B:2+a,C:-2+a};
    s.input='Grasp → Shape     Squeeze → Stiffness';
    s.output='Tilt → Weight distribution     Shake → Inertia';
  }
  for(const key of ['A','B','C'] as const)s.angles[key]=clamp(s.angles[key],-10,10);
  return s;
}
