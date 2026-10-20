import { Journey } from "@/components/landing/Journey";
import { ClaimsSection, MethodSection, ResearchSignalsSection, WorkspaceSection } from "@/components/landing/Sections";

export default function Home() {
  return (
    <main>
      <Journey />
      <WorkspaceSection />
      <ResearchSignalsSection />
      <MethodSection />
      <ClaimsSection />
    </main>
  );
}
