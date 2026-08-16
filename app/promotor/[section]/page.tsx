import { PlannedSection } from "@/components/planned-section";
export default async function PromoterSection({ params }: { params: Promise<{ section: string }> }) { const { section } = await params; return <PlannedSection section={section} context="Promotor"/>; }
