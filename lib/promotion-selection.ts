export type PromocionCandidata = {
  eligible: boolean;
  discount_amount_cop: number;
};

export function mejorPromocionElegible<T extends PromocionCandidata>(promociones: readonly T[]): T | undefined {
  return promociones.reduce<T | undefined>((mejor, promocion) => {
    if (!promocion.eligible || !Number.isFinite(promocion.discount_amount_cop) || promocion.discount_amount_cop <= 0) return mejor;
    if (!mejor || promocion.discount_amount_cop > mejor.discount_amount_cop) return promocion;
    return mejor;
  }, undefined);
}
