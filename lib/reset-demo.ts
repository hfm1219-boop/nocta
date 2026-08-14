const PREFIJO_NOCTA = "nocta-";

function borrarClavesNocta(storage: Storage) {
  const claves = Array.from({ length: storage.length }, (_, indice) => storage.key(indice))
    .filter((clave): clave is string => Boolean(clave?.startsWith(PREFIJO_NOCTA)));
  claves.forEach((clave) => storage.removeItem(clave));
  return claves.length;
}

export function restablecerTodaLaDemo() {
  const locales = borrarClavesNocta(localStorage);
  const sesion = borrarClavesNocta(sessionStorage);
  return { clavesEliminadas: locales + sesion };
}
