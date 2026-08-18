export async function executeConfirmedWrite<T>(confirmed: boolean, mutation: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: "CONFIRMATION_REQUIRED" }> {
  if (!confirmed) return { ok: false, error: "CONFIRMATION_REQUIRED" };
  return { ok: true, data: await mutation() };
}
