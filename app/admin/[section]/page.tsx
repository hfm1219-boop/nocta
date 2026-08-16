import { PlannedSection } from "@/components/planned-section";
export default async function EstablishmentSection({ params }: { params: Promise<{ section: string }> }) { const { section } = await params; return <PlannedSection section={section} context="Establecimiento"/>; }
