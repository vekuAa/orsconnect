import { AppPage } from "@/components/app-page";
import { ProvidersContent } from "@/components/providers-content";

export default function PrestatairesPage() {
  return (
    <AppPage allowedRoles={["admin"]}>
      <ProvidersContent />
    </AppPage>
  );
}