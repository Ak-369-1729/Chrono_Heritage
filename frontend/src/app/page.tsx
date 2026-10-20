import { Journey } from "@/components/landing/Journey";
import { ClaimsSection, MethodSection, ResearchSignalsSection, WorkspaceSection } from "@/components/landing/Sections";

export default function Home() {
  return (
    <main>
      <Journey />
      <div className="research-home">
        <WorkspaceSection />
        <ResearchSignalsSection />
        <MethodSection />
        <ClaimsSection />
      </div>
    </main>
  );
}
