import { AppPage } from "@/components/app-page";
import { ConcessionsContent } from "@/components/concessions-content";

export default function ConcessionsPage() {
  return (
    <AppPage allowedRoles={["admin", "directeur"]}>
      <ConcessionsContent />
    </AppPage>
  );
}
