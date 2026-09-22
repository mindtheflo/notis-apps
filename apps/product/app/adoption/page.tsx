import '../dashboard.css';
import {useState} from 'react';
import {useDocuments,useNotisNavigation,ViewSkeleton} from '@notis/sdk';
import {Button} from '@/components/ui/button';
import {NativeSelect} from '@/components/ui/native-select';
import {Empty,ErrorNotice,WorkButton,Findings} from '@/components/analysis-ui';
import {DB,text,number,date,json,type Finding} from '@/lib/analysis';

export default function Dashboard(){
 const tickets=useDocuments('tickets',{fetchAll:true,pageSize:100,includeContent:false});
 const versions=useDocuments('versions',{fetchAll:true,pageSize:100,includeContent:false});
 const features=useDocuments(DB.features,{fetchAll:true,pageSize:100,includeContent:false});
 const research=useDocuments(DB.research,{fetchAll:true,pageSize:100,includeContent:false});
 const [period,setPeriod]=useState('all');const {toRoute}=useNotisNavigation();
 const snapshots=[...research.documents].filter(r=>text(r,'Record kind')==='Snapshot'&&text(r,'Status')==='Ready').sort((a,b)=>text(b,'Window end').localeCompare(text(a,'Window end')));
 const latest=snapshots[0];
 const periods=[...new Set(features.documents.map(r=>text(r,'Window end')).filter(Boolean))].sort().reverse();
 const observations=features.documents.filter(r=>text(r,'Feature')&&(period==='all'||text(r,'Window end')===period));
 const latestByFeature=new Map<string,typeof observations[number]>();
 for(const row of [...observations].sort((a,b)=>text(a,'Window end').localeCompare(text(b,'Window end'))))latestByFeature.set(text(row,'Feature ID')||text(row,'Feature'),row);
 const measured=[...latestByFeature.values()];
 const sources=[tickets,versions,features,research];
 const refresh=()=>sources.forEach(s=>s.refetch());
 return <main className="pd-shell isolate antialiased" data-store-screenshot="dashboard">
 <header className="pd-header"><div><h1>Product dashboard</h1><p>What shipped, what people use, and what to improve next.</p></div><div className="pd-controls"><Button type="button" variant="ghost" size="sm" onClick={refresh}>Refresh</Button><WorkButton skill="product-onboarding" label="Set up sources" prompt="Run product-onboarding for this Product installation."/></div></header>
 <div className="pd-kpi-wrap"><div className="pd-kpis">
 <div><label>Active tickets</label><strong>{tickets.hasData?tickets.documents.filter(r=>!['Done','Canceled'].includes(text(r,'Status'))).length:'—'}</strong><small>Across your backlog and current work</small></div>
 <div><label>Published releases</label><strong>{versions.hasData?versions.documents.filter(r=>text(r,'Status')==='Published').length:'—'}</strong><small>Verified in your release ledger</small></div>
 <div><label>Features measured</label><strong>{features.hasData?measured.filter(r=>text(r,'Measurement status')==='Measured').length:'—'}</strong><small>Latest available observation per feature</small></div>
 </div></div>
 {sources.map((s,i)=><ErrorNotice key={i} error={s.error} retry={s.refetch}/>)}
 <section className="space-y-4"><header className="pd-header"><div><h2>Feature adoption</h2><p>Measured use relative to the eligible audience, with source and period.</p></div><NativeSelect name="measurement-period" aria-label="Measurement period" value={period} onChange={e=>setPeriod(e.target.value)}><option value="all">Latest per feature</option>{periods.map(p=><option key={p} value={p}>{date(p)}</option>)}</NativeSelect></header>
 {!features.hasData&&!features.error?<ViewSkeleton variant="table" rows={4}/>:features.hasData&&!measured.length?<Empty title="No measurements yet">Set up your evidence source, then run the bundled adoption workflow. Missing evidence is not zero usage.</Empty>:<div className="research-table-scroll"><table><thead><tr><th>Feature</th><th>Adopters</th><th>Eligible users</th><th>Adoption</th><th>Window ending</th><th>Evidence</th></tr></thead><tbody>{measured.map(r=>{const a=number(r,'Adopters'),n=number(r,'Eligible users'),valid=text(r,'Measurement status')==='Measured'&&a!==null&&n!==null&&n>0&&a<=n;return <tr key={r.id}><td>{text(r,'Feature')||r.title}</td><td>{a??'—'}</td><td>{n??'—'}</td><td>{valid?`${(a!/n!*100).toFixed(1)}%`:text(r,'Measurement status')||'Unmeasured'}</td><td>{date(text(r,'Window end'))}</td><td>{text(r,'Source')||'Not recorded'}<p>{text(r,'Interpretation')}</p></td></tr>})}</tbody></table></div>}
 <WorkButton skill="measure-adoption" label="Measure adoption" prompt="Use product-measure-adoption for this installed Product app. Use only my configured sources and preserve unknown values."/>
 </section>
 <section className="space-y-4"><header><h2>What customers need</h2><p>Private aggregate research, without exposing raw conversations.</p></header>
 {!research.hasData&&!research.error?<ViewSkeleton variant="table" rows={3}/>:latest?<><p>{text(latest,'Summary')}</p><Findings rows={json<Finding[]>(latest,'Findings',[])}/><p className="research-muted">{date(text(latest,'Window start'))} – {date(text(latest,'Window end'))} · {text(latest,'Source')||'Source not recorded'} · {text(latest,'Method')||'Method not recorded'}</p></>:research.hasData?<Empty title="Start with a question">Choose a research source during onboarding, then collect a verified snapshot.</Empty>:null}
 <div className="pd-controls"><WorkButton skill="research-conversations" label="Update research" prompt="Use product-research-conversations for this installed Product app and my configured research source."/><Button type="button" variant="ghost" onClick={()=>toRoute('/opportunities')}>Review opportunities</Button><Button type="button" variant="ghost" onClick={()=>toRoute('/')}>Open tickets</Button></div>
 </section>
 </main>;
}
