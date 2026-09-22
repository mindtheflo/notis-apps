import type {DocumentRecord} from '@notis/sdk';
export const DB={research:'product_research_breakdowns',features:'product_feature_observations',opportunities:'product_opportunities',runs:'product_runs'} as const;
export function scalar(v:unknown):unknown {if(!v||typeof v!=='object'||!('type' in v))return v;const r=v as Record<string,any>,x=r[r.type];if(r.type==='title'||r.type==='rich_text')return (x||[]).map((t:any)=>t.text?.content??t.plain_text??'').join('');if(r.type==='date')return x?.start??null;if(r.type==='select'||r.type==='status')return x?.name??null;return x;}
export function text(r:DocumentRecord,k:string){const v=scalar(r.properties[k]);return typeof v==='string'?v:'';}
export function number(r:DocumentRecord,k:string):number|null{const v=scalar(r.properties[k]);return typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;}
export function json<T>(r:DocumentRecord,k:string,fallback:T):T{try{const v=JSON.parse(text(r,k));return Array.isArray(fallback)&&!Array.isArray(v)?fallback:v??fallback;}catch{return fallback;}}
export function snapshotKey(r:DocumentRecord){return text(r,'Snapshot key')||text(r,'Key')||r.id;}
export function date(v:string){if(!v||!Number.isFinite(Date.parse(v)))return 'Unknown';return new Intl.DateTimeFormat('en',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(v));}
export function count(v:number|null){return v===null?'—':v.toLocaleString('en');}
export function featureDelta(r:DocumentRecord){if(scalar(r.properties.Comparable)!==true||text(r,'Measurement status')!=='Measured')return 'Not comparable';const a=number(r,'Adopters'),b=number(r,'Previous adopters');if(a===null||b===null)return 'Unknown';if(b===0)return a===0?'No change':'New adoption';return `${a-b>0?'+':''}${((a-b)/b*100).toFixed(1)}%`;}
export interface Finding {id?:string;title:string;body?:string;paragraphs?:string[];bullets?:string[];tables?:{columns:string[];rows:(string|number|null)[][]}[];bars?:{label:string;value:number;note?:string}[];}
export function matchingRevision(r:DocumentRecord,s:DocumentRecord){return text(r,'Snapshot key')===snapshotKey(s)&&text(r,'Result digest')===text(s,'Result digest');}
