import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ArrowUpRight, BarChart3, CheckCheck, ClipboardList, Download, FileSpreadsheet, PackageSearch, SlidersHorizontal, TrendingUp, Wallet, ShieldCheck, Search } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Button } from '@/components/ui/Button';
import { Link } from '@/lib/router-compat';
import type { SmartReportDetail } from '@/lib/report-smart';
import { inventoryAdvice, salesAdvice, suggestedOrder, type InventoryItem } from '@/lib/report-intelligence/merchant-advisor';

const format = (value: number|null) => value===null?'غير متاح':new Intl.NumberFormat('ar-YE',{maximumFractionDigits:1}).format(value);
const statuses = {negative:'تسوية رصيد',empty:'رصيد صفري',urgent:'نفاد قريب',slow:'حركة ضعيفة',healthy:'متاح'};
type Tab = 'brief'|'priorities'|'forecast'|'tasks'|'data'|'evidence';
export function MerchantReportWorkspace({report,data,evidence}: {report:SmartReportDetail;data:ReactNode;evidence:ReactNode}) {
  const [tab,setTab] = useState<Tab>('brief');
  const [sheet,setSheet] = useState('');
  const [filter,setFilter] = useState('attention');
  const [search,setSearch] = useState('');
  const [target,setTarget] = useState(30);
  const [change,setChange] = useState(0);
  const rows = useMemo(()=>report.canonicalRows.map(row=>row.data),[report]);
  const sheets = useMemo(()=>[...new Set(rows.map(row=>String(row._source_sheet??'المصدر')))],[rows]);
  const selected = sheet || sheets[0] || 'المصدر';
  const selectedRows = useMemo(()=>rows.filter(row=>String(row._source_sheet??'المصدر')===selected),[rows,selected]);
  const stock = useMemo(()=>inventoryAdvice(selectedRows),[selectedRows]);
  const sales = useMemo(()=>salesAdvice(selectedRows),[selectedRows]);
  const inventory = stock.items.length>0 && (report.specialty==='inventory' || stock.demandKnown>0);
  const financial = !inventory && sales.groups.some(g=>g.count>0);
  const reportName = inventory?'المخزون تحت المجهر':financial?'المبيعات تحت المجهر':'قراءة أعمالك';
  const context = '?reportJobId='+encodeURIComponent(report.jobId)+'&sourceHash='+encodeURIComponent(report.sourceHash);
  const group = sales.groups[0];
  const actionable = stock.activeStockouts+stock.urgent+stock.negative;
  const filtered = stock.ranked.filter(item=>(filter==='all'||filter==='attention'&&['negative','urgent','empty'].includes(item.status)||item.status===filter)
    && (!search || item.name.includes(search)||item.id.includes(search)));
  const riskMessage = inventory
    ? actionable ? `${format(stock.activeStockouts)} صنفاً بلا رصيد مع طلب، و${format(stock.urgent)} قد ينفد خلال أسبوع؛ عالج ${format(stock.negative)} رصيداً سالباً قبل الشراء.`
      : 'لا توجد إشارات نفاد عاجلة مثبتة؛ راجع الحركة الضعيفة وحافظ على توازن التوريد.'
    : financial&&group ? `${format(group.total)} ${group.currency} عبر ${format(group.count)} فاتورة؛ راقب اعتماد المبيعات على كبار العملاء ونسبة البيع الآجل.`
    : report.intelligence.advisorBrief.headline;
  const tabs: Array<{id:Tab;label:string;icon:typeof BarChart3}> = [{id:'brief',label:'خلاصة المستشار',icon:BarChart3},{id:'priorities',label:'الأولويات',icon:AlertTriangle},
    {id:'forecast',label:'التوقع والسيناريو',icon:TrendingUp},{id:'tasks',label:'خطة العمل',icon:ClipboardList},{id:'data',label:'البيانات الأصلية',icon:FileSpreadsheet},{id:'evidence',label:'الدليل',icon:ShieldCheck}];
  const exportPlan = async()=>{
    const xlsx = await import('xlsx');
    const output = inventory ? stock.ranked.filter(i=>i.status!=='healthy').map(i=>({الصنف:i.name,'رمز الصنف':i.id,الوحدة:i.unit,الحالة:statuses[i.status],الرصيد:i.stock,'البيع اليومي':i.daily,'التغطية بالأيام':i.days,
      'كمية مقترحة مشروطة':suggestedOrder(i,target,change)?.quantity??null,'افتراض أيام التغطية':target,'افتراض تغير الطلب %':change,'صف المصدر':i.sourceRow}))
      : report.intelligence.recommendations.map(r=>({التوصية:r.title,الإجراء:r.action,السبب:r.why,المسؤول:r.ownerHint,القياس:r.measurement,الحدود:r.limitation}));
    const book=xlsx.utils.book_new();xlsx.utils.book_append_sheet(book,xlsx.utils.json_to_sheet(output),'خطة العمل');xlsx.writeFile(book,'خطة-التقرير.xlsx');
  };
  const inspect = (item:InventoryItem)=> {setSearch(item.name);setFilter('all');setTab('priorities');};
  return <div dir="rtl" className="merchant-report pb-8">
    <header className="merchant-heading">
      <div className="min-w-0"><Link to="/reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft size={14}/> مركز التقارير</Link>
        <h1 className="mt-3 text-3xl font-bold text-foreground">{reportName}</h1><p className="mt-2 break-words text-sm text-muted-foreground">{report.sourcePath.split('/').pop()} · {format(selectedRows.length)} سجل محلل</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={()=>void exportPlan()}><Download size={16}/> تصدير خطة العمل</Button><Link className="merchant-link" to={'/work-center'+context}><ClipboardList size={16}/> متابعة التنفيذ</Link></div>
    </header>
    {sheets.length>1&&<div className="my-4 flex flex-wrap items-center gap-3"><label htmlFor="merchant-sheet" className="text-sm text-muted-foreground">جدول التقرير</label><select id="merchant-sheet" value={selected} onChange={e=>{setSheet(e.target.value);setSearch('');}} className="rounded-md border border-input bg-background px-3 py-2 text-foreground">{sheets.map(s=><option key={s}>{s}</option>)}</select></div>}
    {report.canonicalAnalysisScope!=='FULL_SOURCE'&&<p role="alert" className="merchant-warning">القراءة جزئية؛ الاستنتاجات تخص السجلات المقروءة فقط، وليست حكماً على كامل الملف.</p>}
    <nav className="merchant-tabs" aria-label="أقسام التقرير الذكي">{tabs.map(t=><Button key={t.id} variant="ghost" aria-pressed={tab===t.id} onClick={()=>setTab(t.id)} className={tab===t.id?'merchant-tab-active':''}><t.icon size={16}/>{t.label}</Button>)}</nav>

    {tab==='brief'&&<>
      <section className="merchant-verdict">
        <div className="merchant-verdict-label"><span className="merchant-live-dot"/> قراءة المستشار <span className="merchant-subtle-tag">من ملفك الفعلي</span></div>
        <h2 className="mt-4 max-w-4xl text-2xl font-bold leading-relaxed">{riskMessage}</h2>
        <div className="mt-5 flex flex-wrap gap-3"><Button onClick={()=>setTab('priorities')}><PackageSearch size={17}/> {inventory?'راجع قائمة الأولويات':'راجع النتائج'}<ArrowUpRight size={16}/></Button><Button variant="ghost" onClick={()=>setTab('forecast')}>اختبر تغير الطلب <ArrowLeft size={16}/></Button></div>
        <div className="merchant-verdict-footer"><ShieldCheck size={15}/>{report.reportVerificationState==='VERIFIED'?'المصدر معتمد؛ التنفيذ يحتاج قراراً مستقلاً':'قراءة استشارية؛ راجع الدليل قبل اعتماد إجراء'}{inventory&&stock.missingStock>0?` · ${format(stock.missingStock)} سجلاً دون رصيد قابل للقراءة`:''}</div>
      </section>
      <section className="merchant-metrics" aria-label="مؤشرات التقرير">{inventory?<>
        <Metric label="نفاد قريب · خلال أسبوع" value={stock.urgent} icon={<TrendingUp size={19}/>} note="رصيد موجب وتغطية من الطلب اليومي" tone="warning"/>
        <Metric label="رصيد صفري" value={stock.zero} icon={<PackageSearch size={19}/>} note={`${format(stock.activeStockouts)} منها لها حركة طلب`} tone="danger"/>
        <Metric label="أرصدة تحتاج تسوية" value={stock.negative} icon={<AlertTriangle size={19}/>} note="منفصلة عن الرصيد الصفري والنفاد" tone="danger"/>
        <Metric label="حركة ضعيفة / متوقفة" value={stock.slow} icon={<Wallet size={19}/>} note="لا نعتبر مدة التقرير عمر الصنف" tone="primary"/>
      </>:financial&&group?<>
        <Metric label="صافي المبيعات" value={group.total} icon={<Wallet size={19}/>} note={group.currency}/>
        <Metric label="فواتير محللة" value={group.count} icon={<FileSpreadsheet size={19}/>} note="من الجدول المحدد"/>
        <Metric label="عملاء ظاهرون" value={group.customers.length} icon={<BarChart3 size={19}/>} note="تجميع باسم العميل"/>
        <Metric label="نسبة البيع الآجل" value={group.total>0?group.credit/group.total*100:null} icon={<AlertTriangle size={19}/>} note="% · ليست مديونية غير مدفوعة" tone="warning"/>
      </>:<><Metric label="سجلات محللة" value={selectedRows.length} icon={<FileSpreadsheet size={19}/>} note="الجدول المحدد"/><Metric label="توصيات" value={report.intelligence.recommendations.length} icon={<ClipboardList size={19}/>} note="حسب ما يثبته المصدر"/></>}</section>
      <div className="merchant-two-columns">
        <section className="merchant-section"><SectionTitle title={inventory?'ابدأ بهذه الأصناف':'من أين تأتي القيمة؟'} subtitle={inventory?'أولوية التشغيل، ثم حجم الطلب':'التوزيع حسب العميل، دون خلط العملات'} icon={<PackageSearch size={20}/>}/>
          {inventory?stock.ranked.filter(i=>i.status!=='healthy').slice(0,5).map((item,index)=><div className="merchant-ranked-item" key={item.id+index}><span className="merchant-rank">{index+1}</span><div className="min-w-0 flex-1"><div className="break-words text-sm font-semibold text-foreground">{item.name}</div><div className="mt-1 text-xs text-muted-foreground">{statuses[item.status]} · رصيد {format(item.stock)} {item.unit}</div></div><Button variant="ghost" title={'فحص '+item.name} aria-label={'فحص '+item.name} onClick={()=>inspect(item)}><ArrowUpRight size={17}/></Button></div>)
          : group?.customers.slice(0,5).map((c,index)=><div className="merchant-ranked-item" key={c.name}><span className="merchant-rank">{index+1}</span><span className="min-w-0 flex-1 break-words text-sm font-medium">{c.name}</span><strong className="text-sm">{format(c.value)}</strong></div>)}
          <Button variant="ghost" className="mt-4" onClick={()=>setTab('priorities')}>كل الأولويات <ArrowLeft size={15}/></Button>
        </section>
        <section className="merchant-section"><SectionTitle title="لماذا؟ وماذا ينبغي أن تفعل؟" subtitle="الاستشارة مرتبطة بالسبب، لا بالأرقام وحدها" icon={<CheckCheck size={20}/>}/>
          {inventory?<div className="space-y-5 mt-6"><Guidance title="أوقف تسرب المبيعات" text={`ابدأ بالأصناف ${format(stock.activeStockouts)} ذات الرصيد الصفري والطلب المثبت. تحقق من البدائل والتوريد ثم اختبر كمية تغطي مدة تختارها.`}/>
            <Guidance title="صحح الصورة قبل الشراء" text={`الأرصدة السالبة ${format(stock.negative)} قد تنتج عن حركة غير مرحّلة أو اختلاف جرد. طابق المستندات؛ لا نحول الرصيد السالب تلقائياً إلى طلب شراء.`}/>
            <Guidance title="لا تجمّد سيولة إضافية" text={`راجع ${format(stock.slow)} صنفاً ضعيف الحركة قبل تجديدها. القيمة المالية غير متاحة دون تكلفة وحدة؛ لا نختلق ربحاً أو خسارة.`}/></div>
          :report.intelligence.recommendations.slice(0,3).map(r=><div key={r.id} className="mt-5"><Guidance title={r.title} text={r.action}/><p className="mt-2 text-xs leading-6 text-muted-foreground">السبب: {r.why}</p></div>)}
        </section>
      </div>
      {inventory?<section className="merchant-section"><SectionTitle title="المتاح فعلياً حسب الوحدة" subtitle="لا يُجمع الكيس والكرتون والحبة في رقم مضلل؛ الأرصدة السالبة منفصلة" icon={<BarChart3 size={20}/>}/><div className="merchant-unit-grid">{stock.byUnit.map(u=><div key={u.unit}><span className="text-sm text-muted-foreground">{u.unit}</span><strong className="mt-2 block text-2xl text-foreground">{format(u.value)}</strong></div>)}</div></section>
      : financial&&group&&group.months.length>1?<section className="merchant-section"><SectionTitle title="المبيعات عبر الأشهر" subtitle="قيم مرصودة؛ آخر شهر قد يكون غير مكتمل" icon={<TrendingUp size={20}/>}/><SalesChart points={group.months}/></section>:null}
    </>}
    {tab==='priorities'&&<section className="merchant-section"><SectionTitle title={inventory?'قائمة المعالجة والتوريد':'النتائج والتوصيات'} subtitle="ما الذي يجب فعله، ولماذا، وعلى أي بيانات؟" icon={<AlertTriangle size={20}/>}/>
      {inventory?<><div className="merchant-filterbar"><div className="flex flex-wrap gap-2">{[['attention','تحتاج إجراء'],['negative','رصيد سالب'],['empty','رصيد صفري'],['urgent','نفاد قريب'],['slow','حركة ضعيفة'],['all','الكل']].map(([id,label])=><Button key={id} variant={filter===id?'primary':'secondary'} onClick={()=>setFilter(id)}>{label}</Button>)}</div><label className="merchant-search"><Search size={16}/><input aria-label="ابحث عن صنف" placeholder="اسم الصنف أو رقمه" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
        <p className="mb-4 text-sm text-muted-foreground">{format(filtered.length)} صنفاً · أيام التغطية تعتمد على معدل البيع اليومي المتاح</p><InventoryTable items={filtered} target={target} change={change}/></>
      :<div className="space-y-4 mt-6">{report.intelligence.recommendations.map(r=><article className="merchant-action" key={r.id}><h3 className="font-semibold">{r.title}</h3><p className="mt-2 text-sm leading-7">{r.action}</p><p className="mt-2 text-sm text-muted-foreground">لماذا: {r.why}</p><p className="mt-2 text-xs text-muted-foreground">القياس: {r.measurement} · المسؤول: {r.ownerHint}</p></article>)}{sales.groups.map(g=><p key={g.currency} className="text-sm">{g.currency}: {format(g.total)} عبر {format(g.count)} فاتورة</p>)}</div>}
    </section>}
    {tab==='forecast'&&<>
      <section className="merchant-section"><SectionTitle title={inventory?'ماذا لو تغيّر الطلب؟':'التوقع والحدود'} subtitle="سيناريو مشروط وليس وعداً بنتيجة مستقبلية" icon={<SlidersHorizontal size={20}/>}/>
        {inventory?<><div className="merchant-scenario-controls"><label>تغطية مستهدفة (أيام)<input type="number" min={1} max={365} value={target} onChange={e=>setTarget(Math.min(365,Math.max(1,Number(e.target.value)||1)))}/></label><label>تغير الطلب المفترض: {change}%<input type="range" min={-50} max={100} step={5} value={change} onChange={e=>setChange(Number(e.target.value))}/></label></div>
          <p className="merchant-warning">الكمية = معدل البيع اليومي × (1 + تغير الطلب) × أيام التغطية − الرصيد. مدة التوريد والطلبات بالطريق غير مثبتة؛ راجعها قبل الاعتماد، والوحدة هي وحدة الصنف.</p>
          <InventoryTable items={[...stock.items].filter(i=>i.stock>=0&&(i.daily??0)>0).sort((a,b)=>(suggestedOrder(b,target,change)?.quantity??0)-(suggestedOrder(a,target,change)?.quantity??0))} target={target} change={change}/></>
        :<><p className="mt-5 text-sm leading-7">{report.intelligence.forecast.note}</p><div className="merchant-metrics"><Metric label="الفترات المرصودة" value={report.intelligence.forecast.observedPeriods} icon={<BarChart3 size={19}/>} note="من المصدر"/><Metric label="التقدير القادم" value={report.intelligence.forecast.nextValue} icon={<TrendingUp size={19}/>} note="تقدير إحصائي، لا نتيجة محققة"/></div><p className="merchant-warning">لا يُعتمد التوقع لاتخاذ التزام مالي دون مراجعة اكتمال الفترات والموسمية. فواتير البيع الآجل لا تثبت رصيد التحصيل الحالي.</p>{group&&group.months.length>1&&<SalesChart points={group.months}/>}</>}
      </section>
    </>}
    {tab==='tasks'&&<section className="merchant-section"><SectionTitle title="خطة عمل مرتبطة بالتقرير" subtitle="مهام مقترحة للمراجعة؛ ليست إجراءات منفذة تلقائياً" icon={<ClipboardList size={20}/>}/>
      <div className="mt-6 space-y-4">{inventory?[
        {title:`تسوية ${format(stock.negative)} رصيداً سالباً`,why:'الرصيد السالب غير صالح لاتخاذ قرار شراء',owner:'مسؤول المخزون والمحاسب',next:'طابق الجرد والحركات غير المرحلة والمستندات، وسجّل التصحيح.',measure:'عدد الأرصدة السالبة بعد المطابقة',count:stock.negative},
        {title:`مراجعة توريد ${format(stock.activeStockouts)} صنفاً نافداً له طلب`,why:'البيع مثبت والرصيد صفري',owner:'مسؤول المشتريات',next:'تحقق من البدائل وموعد المورد والطلبات القائمة، ثم راجع السيناريو.',measure:'عدد الأصناف النافدة ذات طلب قبل وبعد التوريد',count:stock.activeStockouts},
        {title:`حماية ${format(stock.urgent)} صنفاً من النفاد خلال أسبوع`,why:'الرصيد ÷ معدل البيع اليومي لا يتجاوز سبعة أيام',owner:'مسؤول المشتريات والمبيعات',next:'قارن موعد الوصول بأيام التغطية ورتب الموردين حسب الاستعجال.',measure:'عدد الأصناف التي وصل توريدها قبل نفادها',count:stock.urgent},
        {title:`مراجعة ${format(stock.slow)} صنفاً ضعيف الحركة`,why:'حركة صفرية مثبتة أو عمر صنف مرتفع مع حركة ضعيفة',owner:'مسؤول المبيعات',next:'راجع العرض والتسعير والصلاحية قبل التخفيض، وأوقف تجديد ما لا يحتاج تجديداً.',measure:'تغير حركة الأصناف؛ الأثر المالي يحتاج التكلفة',count:stock.slow},
      ].filter(t=>t.count>0).map((task,index)=><article className="merchant-action" key={task.title}><div className="flex items-center gap-3"><span className="merchant-rank">{index+1}</span><h3 className="font-semibold">{task.title}</h3></div><p className="mt-3 text-sm leading-7">{task.next}</p><div className="mt-3 grid gap-3 md:grid-cols-3"><Guidance title="لماذا؟" text={task.why}/><Guidance title="المسؤول المقترح" text={task.owner}/><Guidance title="كيف نقيس النجاح؟" text={task.measure}/></div></article>)
      :report.intelligence.recommendations.map(r=><article className="merchant-action" key={r.id}><h3 className="font-semibold">{r.title}</h3><p className="mt-3 text-sm leading-7">{r.action}</p><p className="mt-3 text-xs text-muted-foreground">المسؤول: {r.ownerHint} · قياس النجاح: {r.measurement}</p></article>)}</div>
      <div className="mt-6 flex flex-wrap gap-3"><Link className="merchant-link" to={'/decision-experience'+context}>مراجعة واعتماد القرار <ArrowLeft size={16}/></Link><Link className="merchant-link merchant-link-secondary" to={'/work-center'+context}>فتح متابعة المهام <ClipboardList size={16}/></Link></div>
    </section>}
    {tab==='data'&&data}
    {tab==='evidence'&&<div className="space-y-5"><section className="merchant-section"><SectionTitle title="نطاق الدليل" subtitle="الاستشارة لا تعني اعتماداً أو تنفيذاً تلقائياً" icon={<ShieldCheck size={20}/>}/><p className="mt-5 text-sm leading-7">السجلات المقروءة: {format(rows.length)} · {report.canonicalAnalysisScope==='FULL_SOURCE'?'كامل النطاق المحفوظ':'قراءة جزئية'}. {report.reportVerificationState==='VERIFIED'?'الدليل النهائي معتمد.':'الدليل النهائي يحتاج مراجعة.'}</p><p className="mt-3 text-sm text-muted-foreground">الكميات حسب وحداتها، والعملات منفصلة أو بالقيمة المحلية الصريحة. البيانات المفقودة ليست صفراً.</p></section>{evidence}</div>}
  </div>;
}
function Metric({label,value,icon,note,tone='primary'}:{label:string;value:number|null;icon:ReactNode;note:string;tone?:string}) {
  return <article className={'merchant-metric merchant-tone-'+tone}><div className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>{label}</span>{icon}</div><strong className="mt-4 block text-3xl font-semibold tabular-nums">{format(value)}</strong><p className="mt-3 text-xs leading-5 text-muted-foreground">{note}</p></article>;
}
function SectionTitle({title,subtitle,icon}:{title:string;subtitle:string;icon:ReactNode}) {return <div className="flex items-start gap-3"><span className="merchant-section-icon">{icon}</span><div><h2 className="text-lg font-semibold text-foreground">{title}</h2><p className="mt-1 text-xs leading-6 text-muted-foreground">{subtitle}</p></div></div>;}
function Guidance({title,text}:{title:string;text:string}) {return <div><h3 className="text-sm font-semibold text-foreground">{title}</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">{text}</p></div>;}
function InventoryTable({items,target,change}:{items:InventoryItem[];target:number;change:number}) {
  const [page,setPage]=useState(0);const pages=Math.max(1,Math.ceil(items.length/20));const current=Math.min(page,pages-1);
  return <><div className="merchant-table-scroll"><table className="merchant-table"><thead><tr><th>الصنف</th><th>الأولوية</th><th>الرصيد</th><th>بيع / يوم</th><th>تغطية / يوم</th><th>كمية مقترحة*</th><th>ماذا تفعل؟</th></tr></thead><tbody>{items.slice(current*20,current*20+20).map((item,index)=>{
    const order=suggestedOrder(item,target,change);
    return <tr key={item.id+index}><td><div className="font-medium">{item.name}</div><div className="mt-1 text-xs text-muted-foreground">{item.id} · {item.unit} · صف {item.sourceRow}</div></td><td><span className={'merchant-status merchant-status-'+item.status}>{statuses[item.status]}</span></td><td>{format(item.stock)}</td><td>{format(item.daily)}</td><td>{format(item.days)}</td><td>{order?format(order.quantity):'غير مؤهلة'}</td><td>{item.status==='negative'?'طابق الجرد والحركات أولاً':item.status==='slow'?'راجع الحركة قبل التجديد':item.status==='empty'?'تحقق من الطلب والبدائل والتوريد':'قارن التغطية بموعد وصول المورد'}</td></tr>;
  })}</tbody></table>{!items.length&&<p className="p-8 text-center text-sm text-muted-foreground">لا توجد أصناف مطابقة في هذا الجدول.</p>}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">* سيناريو {target} يوماً، تغير طلب {change}%؛ لا يشمل الطلبات بالطريق. صفحة {current+1} / {pages}</p><div className="flex gap-2"><Button variant="secondary" disabled={current===0} onClick={()=>setPage(current-1)}>السابق</Button><Button variant="secondary" disabled={current>=pages-1} onClick={()=>setPage(current+1)}>التالي</Button></div></div></>;
}
function SalesChart({points}:{points:Array<{period:string;value:number}>}) {return <div className="merchant-chart" dir="ltr"><ResponsiveContainer width="100%" height="100%"><BarChart data={points}><CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="period" tick={{fill:'var(--muted-foreground)',fontSize:11}}/><YAxis tickFormatter={v=>format(v/1000000)+'m'} width={55} tick={{fill:'var(--muted-foreground)',fontSize:11}}/><Tooltip formatter={v=>format(Number(v))} contentStyle={{background:'var(--card)',borderColor:'var(--border)',color:'var(--foreground)'}}/><Bar dataKey="value" fill="var(--primary)" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>;}