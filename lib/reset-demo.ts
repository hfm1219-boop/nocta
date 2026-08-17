const CLAVES_OPERATIVAS_DEMO = [
  "nocta-db-v1",
  "nocta-cart-v2",
  "nocta-tickets-v1",
  "nocta-reservations-v1",
  "nocta-social-events-v1",
  "nocta-social-participant-v1",
  "nocta-guest-lists-v1",
  "nocta-promoter-events-v1",
  "nocta-order-intent-v1",
];

function esDatoOperativoDemo(clave: string) {
  return CLAVES_OPERATIVAS_DEMO.some((base) => clave === base || clave.startsWith(`${base}:`));
}

function borrarDatosOperativosDemo(storage: Storage) {
  const claves = Array.from({ length: storage.length }, (_, indice) => storage.key(indice))
    .filter((clave): clave is string => Boolean(clave && esDatoOperativoDemo(clave)));
  claves.forEach((clave) => storage.removeItem(clave));
  return claves.length;
}

export function restablecerTodaLaDemo() {
  const locales = borrarDatosOperativosDemo(localStorage);
  const sesion = borrarDatosOperativosDemo(sessionStorage);
  return { clavesEliminadas: locales + sesion };
}
