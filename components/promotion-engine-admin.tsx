"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Catalog = {
  brandProducts: Array<{ id: string; sku: string; name: string; brandName: string }>;
  activations: Array<{ id: string; name: string; campaignName: string; brandName: string }>;
  mappings: Array<{ id: string; brandProductId: string; menuItemId: string; brandQuantity: number; brandUnit: string; verified: boolean; brandApproved?: boolean; venueApproved?: boolean }>;
  menuItems: Array<{ id: string; name: string; sku?: string; price_cop: number; available: boolean }>;
  promotions: Array<{ id: string; title: string; activation_id?: string | null; promotion_rules?: Rule | Rule[] | null }>;
};

type Rule = { id: string; mechanic: string; percentage_off?: number | null; fixed_amount_cop?: number | null; buy_quantity?: number | null; get_quantity?: number | null; fixed_price_cop?: number | null; minimum_quantity: number; minimum_spend_cop?: number | null; maximum_discount_cop?: number | null; per_user_limit?: number | null; total_redemption_limit?: number | null; budget_cop?: number | null; local_time_start?: string | null; local_time_end?: string | null; weekdays?: number[] | null; priority?: number | null; stackable?: boolean; promotion_rule_items?: Array<{ venue_menu_item_id: string; brand_product_id?: string | null }> };

const rulesOf = (promotion?: Catalog["promotions"][number]) => promotion ? (Array.isArray(promotion.promotion_rules) ? promotion.promotion_rules : promotion.promotion_rules ? [promotion.promotion_rules] : []) : [];

export function PromotionEngineAdmin({ venueId }: { venueId: string }) {
  const [data, setData] = useState<Catalog>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedPromotionId, setSelectedPromotionId] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/promotion-admin?venueId=${encodeURIComponent(venueId)}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "No fue posible cargar el motor");
    setData(body);
  }, [venueId]);
  useEffect(() => {
    let active = true;
    void fetch(`/api/promotion-admin?venueId=${encodeURIComponent(venueId)}`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No fue posible cargar el motor");
      if (active) setData(body);
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Error"); });
    return () => { active = false; };
  }, [venueId]);

  async function send(body: Record<string, unknown>, form: HTMLFormElement, reset = true) {
    setBusy(true); setError(""); setNotice("");
    const response = await fetch("/api/promotion-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, venueId }) });
    const result = await response.json(); setBusy(false);
    if (!response.ok) return setError(result.error ?? "No fue posible guardar");
    if (reset) form.reset(); setNotice("Configuración guardada y disponible para evaluación."); await load();
  }

  function mapProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const f = new FormData(form);
    void send({ action: "mapping", brandProductId: f.get("brandProductId"), menuItemId: f.get("menuItemId"), brandQuantity: Number(f.get("brandQuantity")), brandUnit: f.get("brandUnit") }, form);
  }
  function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const f = new FormData(form);
    void send({ action: "rule", promotionId: f.get("promotionId"), activationId: f.get("activationId"), menuItemId: f.get("menuItemId"), brandProductId: f.get("brandProductId"), mechanic: f.get("mechanic"), benefit: Number(f.get("benefit")), buyQuantity: Number(f.get("buyQuantity")), getQuantity: Number(f.get("getQuantity")), minimumQuantity: Number(f.get("minimumQuantity")), minimumSpendCop: Number(f.get("minimumSpendCop")), maximumDiscountCop: Number(f.get("maximumDiscountCop")), perUserLimit: Number(f.get("perUserLimit")), totalLimit: Number(f.get("totalLimit")), budgetCop: Number(f.get("budgetCop")), timeStart: f.get("timeStart"), timeEnd: f.get("timeEnd"), weekdays: f.getAll("weekdays").map(Number), priority: Number(f.get("priority")), stackable: f.get("stackable") === "on" }, form, false);
  }

  if (!data && !error) return <section className="card p-5 text-muted">Cargando motor de promociones…</section>;
  return <section className="space-y-4 border-t border-line pt-6">
    <div><p className="text-xs uppercase tracking-[.18em] text-neon3">Motor transaccional</p><h2 className="text-xl font-bold mt-1">Productos, reglas y atribución</h2><p className="text-sm text-muted">Conecta el SKU de marca con el producto vendido y convierte una promoción editorial en un beneficio calculable.</p></div>
    {error && <p className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-danger">{error}</p>}{notice && <p className="rounded-xl border border-lime/30 bg-lime/10 p-3 text-lime">{notice}</p>}
    {data && (() => { const activePromotionId=selectedPromotionId||data.promotions[0]?.id||"";const promotion=data.promotions.find(item=>item.id===activePromotionId);const rule=rulesOf(promotion)[0];const ruleItem=rule?.promotion_rule_items?.[0];const benefit=rule?.mechanic==="percentage"?rule.percentage_off:rule?.mechanic==="fixed_amount"?rule.fixed_amount_cop:rule?.mechanic==="fixed_price"?rule.fixed_price_cop:"";return <div className="grid lg:grid-cols-2 gap-4">
      <form onSubmit={mapProduct} className="card p-5 space-y-3"><h3 className="font-bold">1. Mapping de sell-out</h3><Select name="brandProductId" label="SKU de marca" items={data.brandProducts.map(x => ({ id: x.id, name: `${x.brandName} · ${x.sku} · ${x.name}` }))}/><Select name="menuItemId" label="Producto del menú" items={data.menuItems.map(x => ({ id: x.id, name: `${x.name} · $${x.price_cop.toLocaleString("es-CO")}` }))}/><div className="grid grid-cols-2 gap-2"><input name="brandQuantity" required type="number" min="0.0001" step="0.0001" className="entrada" placeholder="Cantidad consumida"/><select name="brandUnit" className="entrada bg-background"><option value="ml">ml</option><option value="g">g</option><option value="unit">unidad</option><option value="serving">porción</option></select></div><button disabled={busy} className="btn-neon rounded-xl p-3 w-full disabled:opacity-50">Proponer mapping</button><div className="text-xs text-muted space-y-1">{data.mappings.map(x => <p key={x.id}>{x.verified?"✓ Verificado":"◷ Pendiente de marca"} · {data.brandProducts.find(p => p.id === x.brandProductId)?.name} → {data.menuItems.find(p => p.id === x.menuItemId)?.name} · {x.brandQuantity} {x.brandUnit}</p>)}</div></form>
      <form key={activePromotionId} onSubmit={createRule} className="card p-5 space-y-3"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">2. Regla y atribución</h3><p className="text-xs text-muted">Selecciona una promoción para cargar y editar su configuración.</p></div>{rule&&<span className="rounded-full bg-lime/10 px-2.5 py-1 text-xs text-lime">Configurada</span>}</div><Select name="promotionId" label="Promoción" value={activePromotionId} onChange={setSelectedPromotionId} items={data.promotions.map(x => ({ id: x.id, name: `${x.title}${rulesOf(x).length ? " · configurada" : ""}` }))}/><Select name="activationId" label="Activación opcional" optional defaultValue={promotion?.activation_id??""} items={data.activations.map(x => ({ id: x.id, name: `${x.brandName} · ${x.campaignName} · ${x.name}` }))}/><Select name="menuItemId" label="Producto beneficiado" defaultValue={ruleItem?.venue_menu_item_id??""} items={data.menuItems.map(x => ({ id: x.id, name: x.name }))}/><Select name="brandProductId" label="SKU atribuible (obligatorio con activación)" optional defaultValue={ruleItem?.brand_product_id??""} items={data.brandProducts.map(x => ({ id: x.id, name: `${x.brandName} · ${x.sku}` }))}/><select name="mechanic" defaultValue={rule?.mechanic??"percentage"} className="entrada bg-background"><option value="percentage">Porcentaje de descuento</option><option value="fixed_amount">Monto fijo</option><option value="buy_x_get_y">Compra X y recibe Y</option><option value="fixed_price">Precio fijo</option></select><div className="grid grid-cols-3 gap-2"><input name="benefit" defaultValue={benefit??""} type="number" min="1" className="entrada" placeholder="% / valor"/><input name="buyQuantity" defaultValue={rule?.buy_quantity??""} type="number" min="1" className="entrada" placeholder="Compra X"/><input name="getQuantity" defaultValue={rule?.get_quantity??""} type="number" min="1" className="entrada" placeholder="Recibe Y"/></div><div className="grid grid-cols-2 gap-2"><input name="minimumQuantity" type="number" min="1" defaultValue={rule?.minimum_quantity??1} className="entrada" placeholder="Cantidad mínima"/><input name="minimumSpendCop" type="number" min="0" defaultValue={rule?.minimum_spend_cop??""} className="entrada" placeholder="Compra mínima COP"/></div><div className="grid grid-cols-2 gap-2"><input name="maximumDiscountCop" type="number" min="1" defaultValue={rule?.maximum_discount_cop??""} className="entrada" placeholder="Descuento máximo"/><input name="perUserLimit" type="number" min="1" defaultValue={rule?.per_user_limit??""} className="entrada" placeholder="Límite/usuario"/><input name="totalLimit" type="number" min="1" defaultValue={rule?.total_redemption_limit??""} className="entrada" placeholder="Cupo total"/><input name="budgetCop" type="number" min="1" defaultValue={rule?.budget_cop??""} className="entrada" placeholder="Presupuesto"/></div><div className="grid grid-cols-2 gap-2"><label className="text-xs text-muted">Desde<input name="timeStart" type="time" defaultValue={rule?.local_time_start?.slice(0,5)??""} className="entrada mt-1"/></label><label className="text-xs text-muted">Hasta<input name="timeEnd" type="time" defaultValue={rule?.local_time_end?.slice(0,5)??""} className="entrada mt-1"/></label></div><fieldset><legend className="text-xs text-muted">Días válidos</legend><div className="mt-2 flex flex-wrap gap-2">{["D","L","M","X","J","V","S"].map((day,index)=><label key={day} className="rounded-lg border border-line px-2.5 py-2 text-xs"><input type="checkbox" name="weekdays" value={index} defaultChecked={!rule?.weekdays||rule.weekdays.includes(index)} className="mr-1.5 accent-fuchsia-500"/>{day}</label>)}</div></fieldset><div className="grid grid-cols-2 gap-2"><label className="text-xs text-muted">Prioridad<input name="priority" type="number" defaultValue={rule?.priority??100} className="entrada mt-1"/></label><label className="flex items-center rounded-xl border border-line px-3 text-sm"><input name="stackable" type="checkbox" defaultChecked={rule?.stackable??false} className="mr-2 accent-fuchsia-500"/>Acumulable</label></div><p className="text-xs text-muted">Al vincular una activación, NOCTA exige un mapping SKU ↔ menú aprobado por ambas partes y usa únicamente ventas pagadas y entregadas.</p><button disabled={busy} className="btn-neon rounded-xl p-3 w-full disabled:opacity-50">{rule?"Guardar cambios":"Activar regla"}</button></form>
    </div>})()}
  </section>;
}

function Select({ name, label, items, optional = false, defaultValue, value, onChange }: { name: string; label: string; items: Array<{ id: string; name: string }>; optional?: boolean; defaultValue?: string; value?: string; onChange?: (value:string)=>void }) {
  return <label className="block text-xs text-muted">{label}<select name={name} required={!optional} defaultValue={value===undefined?defaultValue:undefined} value={value} onChange={onChange?event=>onChange(event.target.value):undefined} className="entrada bg-background mt-1"><option value="">{optional ? "Sin vincular" : "Seleccionar"}</option>{items.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>;
}
