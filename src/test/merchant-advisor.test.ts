import { describe, expect, it } from 'vitest';
import { inventoryAdvice, salesAdvice, suggestedOrder } from '@/lib/report-intelligence/merchant-advisor';
import { parseNumber } from '@/lib/file-engine/normalizer';
import { mapColumns } from '@/lib/file-engine/synonyms';

describe('source-bound merchant advice',()=>{
  it('keeps zero, negative and future stockouts disjoint',()=>{
    const r=inventoryAdvice([{current_stock:0,daily_sales_rate:2},{current_stock:-3,daily_sales_rate:2},{current_stock:6,daily_sales_rate:2},{current_stock:20,daily_sales_rate:0,sales_qty:0}]);
    expect([r.zero,r.negative,r.urgent,r.slow]).toEqual([1,1,1,1]);
    expect(r.byUnit[0].value).toBe(26);
  });
  it('does not turn report duration into item aging or period quantity into daily demand',()=>{
    const r=inventoryAdvice([{current_stock:20,sales_qty:100,stock_age_days:0,stock_age_period_days:218}]);
    expect(r.items[0].days).toBeNull();expect(r.slow).toBe(0);
  });
  it('provides conditional quantities and blocks purchasing negative balances',()=>{
    const r=inventoryAdvice([{current_stock:10,daily_sales_rate:2},{current_stock:-3,daily_sales_rate:2}]);
    expect(suggestedOrder(r.items[0],30,0)?.quantity).toBe(50);
    expect(suggestedOrder(r.items[0],30,50)?.quantity).toBe(80);
    expect(suggestedOrder(r.items[1],30,0)).toBeNull();
  });
  it('keeps incompatible units separate',()=>{
    expect(inventoryAdvice([{current_stock:3,unit:'كيس'},{current_stock:4,unit:'كرتون'}]).byUnit).toEqual([{unit:'كيس',value:3},{unit:'كرتون',value:4}]);
  });
  it('uses converted net amounts and never calls credit invoices unpaid debt',()=>{
    const r=salesAdvice([{net_amount:14000,total:100,currency:'SAR',invoice_type:'آجل'},{net_amount:500,total:500,currency:'YER',invoice_type:'نقد'}]);
    expect(r.groups[0].total).toBe(14500);expect(r.groups[0].credit).toBe(14000);
    expect(salesAdvice([{total:100,currency:'SAR'},{total:500,currency:'YER'}]).groups).toHaveLength(2);
  });
  it('parses accounting signs and Arabic digits without losing precision',()=>{
    expect(parseNumber('(١٬٦٣٠٫٥٠)')).toBe(-1630.5);expect(parseNumber('650-')).toBe(-650);expect(parseNumber('1,630,000.00')).toBe(1630000);
  });
  it('maps workbook headers without collapsing posted and net sales',async()=>{
    const m=await mapColumns(['صافي\nمبيعات مرحل','صافي مبيعات\nلم يرحل','صافي المبيعات','الفترةالمتوقعة\nلنفادالكمية','العبوه']);
    expect(m.map(c=>c.mappedField)).toEqual(['posted_sales_qty','unposted_sales_qty','sales_qty','stockout_days','pack_size']);
  });
});