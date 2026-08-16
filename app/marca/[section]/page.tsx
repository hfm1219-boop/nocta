import { PlannedSection } from "@/components/planned-section";
export default async function BrandSection({ params }: { params: Promise<{ section: string }> }) { const { section } = await params; return <PlannedSection section={section} context="Marca / Distribuidor"/>; }
