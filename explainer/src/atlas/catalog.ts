import data from './atlas-data.json';

export type Feasibility = 'presentation' | 'software' | 'tracking' | 'hardware';
export interface ResearchSource { id:string; title:string; authors:string; year:number; url:string; claim:string; transferLimit:string; }
export interface DemoConcept { id:string; title:string; tagline:string; gesture:string; percept:string; feasibility:Feasibility; state:string; slow:string; fast:string; visual:string; additions:string; limit:string; experiment:string; sources:string[]; }
export const sources: ResearchSource[] = data.sources;
export const horizons: Record<Feasibility,{label:string;short:string;description:string;color:string}> = {
  presentation: {label:'今のモデルから',short:'体験を構成',description:'既存の中身の運動を使い、見せ方・課題・判定を加える。完成済みデモという意味ではありません。',color:'#a6dfb4'},
  software: {label:'状態モデルを足す',short:'ソフトウェア',description:'現行のセンサーと出力を使い、量・吸着・生命感などの状態と遷移を追加する。',color:'#f0b777'},
  tracking: {label:'空間のつながりを足す',short:'位置追跡',description:'IMUだけでは分からない、相手や表面との位置関係を外部の追跡で与える。',color:'#adaaf3'},
  hardware: {label:'機構から広げる',short:'追加ハードウェア',description:'握る強さや指の開き、押し返す抵抗など、新しい計測・機構が必要。',color:'#ed9ba4'},
};
function feasibility(value:string):Feasibility {
  if(value==='presentation'||value==='software'||value==='tracking'||value==='hardware')return value;
  throw new Error(`Unknown feasibility: ${value}`);
}
export const demos:DemoConcept[]=data.demos.map(d=>({...d,feasibility:feasibility(d.feasibility)}));
