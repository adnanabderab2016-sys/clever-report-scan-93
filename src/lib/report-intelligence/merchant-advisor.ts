import { normalizeArabicText, parseDate, parseNumber } from '../file-engine/normalizer';

export type BusinessRow = Record<string, unknown>;
const aliases: Record<string, string[]> = {
  product: ['product_name','name','item_name','اسم الصنف','اسم المنتج','الصنف'],
  sku: ['sku','رقم الصنف'], unit: ['unit','الوحدة'], stock: ['current_stock','stock','الرصيد','الرصيد الحالي'],
  daily: ['daily_sales_rate','معدل البيع ليومي','معدل البيع اليومي'], sales: ['sales_qty','صافي المبيعات'],
  days: ['stockout_days','الفترةالمتوقعةلنفادالكمية'], age: ['stock_age_days','عمر المخزون'],
  periodAge: ['stock_age_period_days','عمر المخزون للفترة'], cost: ['cost','cost_price','التكلفة','سعر التكلفة'],
  customer: ['customer_name','اسم العميل','العميل'], date: ['date','invoice_date','التاريخ','تاريخ الفاتورة'],
  net: ['net_amount','net_local','مبلغ الصافي بالمحلي'], total: ['total','اجمالي الفاتورة','إجمالي الفاتورة','الإجمالي'],
  currency: ['currency','العملة'], type: ['invoice_type','نوع الفاتورة'],
};
const key = (value: string) => normalizeArabicText(value).replace(/[\s_-]+/g,'');
export function businessValue(row: BusinessRow, field: string): unknown {
  const names = aliases[field] ?? [field];
  for (const name of names) if (row[name] !== undefined && row[name] !== null && row[name] !== '') return row[name];
  const accepted = names.map(key);
  for (const [name,value] of Object.entries(row)) if (accepted.includes(key(name)) && value !== null && value !== '') return value;
  return null;
}
export type InventoryItem = {
  id: string; name: string; unit: string; stock: number; daily: number | null; days: number | null;
  age: number | null; sales: number | null; cost: number | null; sourceRow: number;
  status: 'negative' | 'empty' | 'urgent' | 'slow' | 'healthy';
};
export function inventoryAdvice(rows: BusinessRow[]) {
  const items: InventoryItem[] = [];
  let missingStock = 0;
  rows.forEach((row,index) => {
    const stock = parseNumber(businessValue(row,'stock'));
    if (stock === null) { missingStock++; return; }
    const daily = parseNumber(businessValue(row,'daily'));
    const sourceDays = parseNumber(businessValue(row,'days'));
    const days = stock > 0 ? (daily !== null && daily > 0 ? stock / daily : sourceDays !== null && sourceDays > 0 ? sourceDays : null) : null;
    // A period age can be report duration, not item age: only the explicit item-age field proves aging.
    const age = parseNumber(businessValue(row,'age'));
    const sales = parseNumber(businessValue(row,'sales'));
    const status = stock < 0 ? 'negative' : stock === 0 ? 'empty' : days !== null && days <= 7 ? 'urgent'
      : (daily === 0 && sales === 0) || (age !== null && age >= 180 && daily !== null && daily <= 1) ? 'slow' : 'healthy';
    items.push({id:String(businessValue(row,'sku') ?? index),name:String(businessValue(row,'product') ?? businessValue(row,'sku') ?? `سجل ${index+1}`),
      unit:String(businessValue(row,'unit') ?? 'وحدة غير محددة'),stock,daily,days,age,sales,cost:parseNumber(businessValue(row,'cost')),
      sourceRow:parseNumber(row._source_row) ?? index+1,status});
  });
  const count = (status: InventoryItem['status']) => items.filter(item=>item.status===status).length;
  const byUnit = new Map<string,number>();
  for (const item of items) byUnit.set(item.unit,(byUnit.get(item.unit)??0)+Math.max(0,item.stock));
  const demandKnown = items.filter(item=>item.daily!==null && (item.daily ?? 0)>0);
  const ranked = [...items].sort((a,b)=>{
    const rank = {negative:0,empty:1,urgent:2,slow:3,healthy:4};
    return rank[a.status]-rank[b.status] || (b.daily??0)-(a.daily??0);
  });
  return {items,ranked,missingStock,zero:count('empty'),negative:count('negative'),urgent:count('urgent'),slow:count('slow'),
    activeStockouts:items.filter(i=>i.status==='empty' && ((i.daily??0)>0 || (i.sales??0)>0)).length,
    byUnit:[...byUnit].map(([unit,value])=>({unit,value})),demandKnown:demandKnown.length};
}
export function suggestedOrder(item: InventoryItem, targetDays: number, demandChange: number) {
  if (item.stock < 0 || item.daily === null || item.daily <= 0 || !Number.isFinite(targetDays) || targetDays <= 0) return null;
  const rate = item.daily * (1 + demandChange / 100);
  const quantity = Math.max(0,Math.ceil(rate * targetDays - item.stock));
  return {quantity,days:rate>0?item.stock/rate:null,value:item.cost!==null && item.cost>0?quantity*item.cost:null};
}
export function salesAdvice(rows: BusinessRow[]) {
  // The source's local net amount is already converted: never combine foreign nominal totals with it.
  const useLocal = rows.length>0 && rows.every(row=>parseNumber(businessValue(row,'net'))!==null);
  const groups = new Map<string,{currency:string;total:number;count:number;credit:number;customers:Map<string,number>;months:Map<string,number>}>();
  let missingAmount = 0;
  for (const row of rows) {
    const amount = parseNumber(businessValue(row,useLocal?'net':'total'));
    if (amount===null) {missingAmount++;continue;}
    const currency = useLocal ? 'المحلي حسب الملف' : String(businessValue(row,'currency')??'عملة غير محددة');
    const group = groups.get(currency)??{currency,total:0,count:0,credit:0,customers:new Map(),months:new Map()};
    group.total+=amount;group.count++;
    if (/اجل|آجل|أجل|credit/i.test(String(businessValue(row,'type')??''))) group.credit+=amount;
    const customer = String(businessValue(row,'customer')??'عميل غير محدد');
    group.customers.set(customer,(group.customers.get(customer)??0)+amount);
    const date = parseDate(businessValue(row,'date'));
    if (date) group.months.set(date.slice(0,7),(group.months.get(date.slice(0,7))??0)+amount);
    groups.set(currency,group);
  }
  return {useLocal,missingAmount,groups:[...groups.values()].map(g=>({...g,
    customers:[...g.customers].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value),
    months:[...g.months].map(([period,value])=>({period,value})).sort((a,b)=>a.period.localeCompare(b.period))}))};
}

export function salesActionPlan(result: ReturnType<typeof salesAdvice>) {
  return result.groups.flatMap(group => {
    const top = group.customers[0];
    const plan = [];
    if (top && group.total > 0) plan.push({id:'customer-'+group.currency,title:'حماية كبار العملاء وتنويع المبيعات',
      action:`تواصل مع ${top.name} لتأكيد الطلبات المقبلة، وقارن نشاط بقية العملاء قبل تحديد هدف تنويع.`,
      why:`أكبر عميل يمثل ${(top.value/group.total*100).toFixed(1)}% من صافي ${group.currency} (${top.value.toLocaleString('ar')}).`,
      ownerHint:'مسؤول المبيعات',measurement:'حصة أكبر عميل واستمرار طلباته',limitation:'الأسماء غير الموحدة قد تمثل العميل نفسه؛ ليست توقعاً لفقدانه.'});
    if (group.credit > 0) plan.push({id:'credit-'+group.currency,title:'مطابقة البيع الآجل مع التحصيل',
      action:'اطلب كشف أرصدة العملاء وإيصالات التحصيل وأعمار الديون؛ طابقها بالفواتير قبل المطالبة بالسداد.',
      why:`البيع الآجل الظاهر ${group.credit.toLocaleString('ar')} ${group.currency}؛ لا يثبت المبلغ المتبقي على العملاء.`,
      ownerHint:'المحاسب ومسؤول التحصيل',measurement:'الرصيد المستحق المؤكد بعد المطابقة',limitation:'لا توجد بيانات سداد أو آجال استحقاق في الفواتير وحدها.'});
    if (group.months.length > 1) plan.push({id:'period-'+group.currency,title:'مراجعة تغير المبيعات قبل تحديد الهدف القادم',
      action:'قارن الأشهر المكتملة حسب العميل ونوع الفاتورة، وراجع الأسباب التشغيلية لأي تغير؛ استبعد الشهر الأخير إن كان جزئياً.',
      why:`المصدر يعرض ${group.months.length} أشهر بقيمة ${group.currency}؛ اختلاف اكتمال الأشهر قد يشوه المقارنة.`,
      ownerHint:'مدير المبيعات',measurement:'مبيعات شهر مكتمل مقابل شهر مكتمل وحصة كل عميل',limitation:'دورة واحدة لا تكفي لإثبات الموسمية أو توقع موثوق.'});
    return plan;
  });
}