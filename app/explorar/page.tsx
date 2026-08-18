import { ExplorarContenido } from "@/components/explorar-contenido";

const tabs = ["todo", "eventos", "lugares", "experiencias", "promociones", "favoritos"] as const;
type Tab = (typeof tabs)[number];

export default async function Explorar({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const requestedTab = (await searchParams).tab;
  const value = Array.isArray(requestedTab) ? requestedTab[0] : requestedTab;
  const initialTab: Tab = tabs.includes(value as Tab) ? value as Tab : "todo";

  return <ExplorarContenido initialTab={initialTab} />;
}
