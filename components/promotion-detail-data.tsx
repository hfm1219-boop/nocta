export type PromotionRuleItem = {
  role: string;
  minimum_quantity: number;
  venue_menu_item_id?: string;
  brand_product_id?: string | null;
  venue_menu_items?: { id: string; name: string; sku?: string | null } | null;
  brand_products?: { id: string; name: string; sku?: string | null; brands?: { name: string } | null } | null;
};

export type PromotionRule = {
  id: string;
  mechanic: string;
  percentage_off?: number | null;
  fixed_amount_cop?: number | null;
  buy_quantity?: number | null;
  get_quantity?: number | null;
  fixed_price_cop?: number | null;
  minimum_quantity: number;
  minimum_spend_cop?: number | null;
  maximum_discount_cop?: number | null;
  per_user_limit?: number | null;
  total_redemption_limit?: number | null;
  budget_cop?: number | null;
  local_time_start?: string | null;
  local_time_end?: string | null;
  timezone?: string | null;
  weekdays?: number[] | null;
  priority: number;
  stackable: boolean;
  active: boolean;
  promotion_rule_items?: PromotionRuleItem[];
};

export type PromotionRecord = {
  id: string;
  venue_id: string;
  title: string;
  description: string;
  terms: string;
  starts_at: string;
  ends_at: string;
  active: boolean;
  campaign_id?: string | null;
  activation_id?: string | null;
  promotion_rules?: PromotionRule | PromotionRule[] | null;
  promotion_redemptions?: Array<{ id: string; status: string; gross_amount_cop: number; discount_amount_cop: number; redeemed_at?: string | null }>;
};

export type SellOutMapping = {
  id: string;
  brand_product_id: string;
  venue_menu_item_id: string;
  brand_quantity: number;
  brand_unit: string;
  verified: boolean;
  active: boolean;
  brand_approved: boolean;
  venue_approved: boolean;
  venue_menu_items?: { venue_id: string; name: string; sku?: string | null } | null;
  brand_products?: { name: string; sku?: string | null; brands?: { name: string } | null } | null;
};

const money = (value?: number | null) => value ? `$${value.toLocaleString("es-CO")}` : "—";
const weekdayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function benefit(rule: PromotionRule) {
  if (rule.mechanic === "percentage") return `${rule.percentage_off ?? 0}% de descuento`;
  if (rule.mechanic === "fixed_amount") return `${money(rule.fixed_amount_cop)} de descuento`;
  if (rule.mechanic === "buy_x_get_y") return `Compra ${rule.buy_quantity ?? 0} y recibe ${rule.get_quantity ?? 0}`;
  if (rule.mechanic === "fixed_price") return `Precio fijo ${money(rule.fixed_price_cop)}`;
  return rule.mechanic;
}

function mappingState(mapping: SellOutMapping) {
  if (!mapping.active) return "Mapping inactivo";
  if (mapping.verified && mapping.brand_approved && mapping.venue_approved) return "Verificado bilateralmente";
  if (!mapping.brand_approved && !mapping.venue_approved) return "Pendiente de ambas partes";
  if (!mapping.brand_approved) return "Pendiente de la marca";
  if (!mapping.venue_approved) return "Pendiente del establecimiento";
  return mapping.verified ? "Verificado" : "Pendiente de verificación";
}

export function PromotionDetailData({ promotion, mappings }: { promotion: PromotionRecord; mappings: SellOutMapping[] }) {
  const rules = Array.isArray(promotion.promotion_rules) ? promotion.promotion_rules : promotion.promotion_rules ? [promotion.promotion_rules] : [];
  const redemptions = promotion.promotion_redemptions ?? [];
  const applied = redemptions.filter(item => ["applied", "redeemed", "delivered"].includes(item.status));
  const gross = applied.reduce((sum, item) => sum + Number(item.gross_amount_cop ?? 0), 0);
  const discount = applied.reduce((sum, item) => sum + Number(item.discount_amount_cop ?? 0), 0);

  return <div className="mt-6 space-y-5 border-t border-line pt-5">
    <section>
      <h3 className="font-bold">Reglas y atribución</h3>
      {!rules.length && <p className="mt-2 rounded-xl border border-amber/30 bg-amber/10 p-3 text-sm text-amber">La promoción está publicada, pero todavía no tiene una regla de aplicación configurada.</p>}
      <div className="mt-3 space-y-4">{rules.map(rule => <article key={rule.id} className="rounded-2xl border border-line bg-surface2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs uppercase tracking-wider text-neon3">Beneficio</p><p className="mt-1 font-bold">{benefit(rule)}</p></div><span className={`rounded-full px-2.5 py-1 text-xs ${rule.active ? "bg-lime/10 text-lime" : "bg-white/5 text-muted"}`}>{rule.active ? "Regla activa" : "Regla inactiva"}</span></div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-muted">Compra mínima</dt><dd>{rule.minimum_quantity} unidad(es){rule.minimum_spend_cop ? ` · ${money(rule.minimum_spend_cop)}` : ""}</dd></div>
          <div><dt className="text-xs text-muted">Límites</dt><dd>{rule.per_user_limit ? `${rule.per_user_limit} por usuario` : "Sin límite individual"}{rule.total_redemption_limit ? ` · ${rule.total_redemption_limit} total` : ""}</dd></div>
          <div><dt className="text-xs text-muted">Presupuesto / tope</dt><dd>{money(rule.budget_cop)}{rule.maximum_discount_cop ? ` · máx. ${money(rule.maximum_discount_cop)}` : ""}</dd></div>
          <div><dt className="text-xs text-muted">Horario</dt><dd>{rule.local_time_start && rule.local_time_end ? `${rule.local_time_start.slice(0,5)}–${rule.local_time_end.slice(0,5)}` : "Toda la vigencia"}</dd></div>
          <div><dt className="text-xs text-muted">Días</dt><dd>{rule.weekdays?.length ? rule.weekdays.map(day => weekdayNames[day] ?? day).join(", ") : "Todos"}</dd></div>
          <div><dt className="text-xs text-muted">Aplicación</dt><dd>Prioridad {rule.priority ?? 0} · {rule.stackable ? "Acumulable" : "No acumulable"}</dd></div>
        </dl>
        <div className="mt-4 space-y-3">{(rule.promotion_rule_items ?? []).map((item, index) => {
          const related = mappings.filter(mapping => mapping.venue_menu_item_id === (item.venue_menu_item_id ?? item.venue_menu_items?.id) && (!item.brand_product_id || mapping.brand_product_id === item.brand_product_id));
          return <div key={`${rule.id}-${index}`} className="rounded-xl border border-line p-3 text-sm">
            <p className="font-semibold">{item.venue_menu_items?.name ?? "Producto del menú"} <span className="font-normal text-muted">· {item.role} · mínimo {item.minimum_quantity}</span></p>
            {item.brand_products && <p className="mt-1 text-xs text-muted">Atribuido a {item.brand_products.brands?.name ?? "Marca"} · {item.brand_products.name} · SKU {item.brand_products.sku ?? "sin SKU"}</p>}
            <div className="mt-3"><p className="text-xs font-semibold uppercase tracking-wider text-neon2">Mapping sell-out</p>{related.length ? related.map(mapping => <div key={mapping.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/60 p-2"><span>{mapping.venue_menu_items?.name ?? item.venue_menu_items?.name} ↔ {mapping.brand_products?.brands?.name ?? "Marca"} {mapping.brand_products?.sku ?? mapping.brand_products?.name}</span><span className={`text-xs ${mapping.verified && mapping.brand_approved && mapping.venue_approved ? "text-lime" : "text-amber"}`}>{mapping.brand_quantity} {mapping.brand_unit} · {mappingState(mapping)}</span></div>) : <p className="mt-1 text-xs text-amber">Sin mapping sell-out aprobado para este producto.</p>}</div>
          </div>;
        })}{!(rule.promotion_rule_items ?? []).length && <p className="text-sm text-amber">La regla aún no tiene productos atribuibles.</p>}</div>
      </article>)}</div>
    </section>
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-xl border border-line p-3"><p className="text-xs text-muted">Solicitudes</p><p className="mt-1 text-xl font-bold">{redemptions.length}</p></div>
      <div className="rounded-xl border border-line p-3"><p className="text-xs text-muted">Aplicadas</p><p className="mt-1 text-xl font-bold">{applied.length}</p></div>
      <div className="rounded-xl border border-line p-3"><p className="text-xs text-muted">Sell-out atribuido</p><p className="mt-1 font-bold">{money(gross)}</p></div>
      <div className="rounded-xl border border-line p-3"><p className="text-xs text-muted">Descuento otorgado</p><p className="mt-1 font-bold">{money(discount)}</p></div>
    </section>
  </div>;
}
