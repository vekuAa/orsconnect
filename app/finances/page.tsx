import { AppPage } from "@/components/app-page";
import { FinancesContent } from "@/components/finances-content";

export default function FinancesPage() {
  return (
    <AppPage allowedRoles={["admin", "directeur"]}>
      <FinancesContent />
    </AppPage>
  );
}