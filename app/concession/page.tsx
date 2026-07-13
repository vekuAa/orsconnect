import { AppPage } from "@/components/app-page";
import { ConcessionPortal } from "@/components/concession-portal";

export default function ConcessionPortalPage() {
  return (
    <AppPage allowedRoles={["concession"]}>
      <ConcessionPortal />
    </AppPage>
  );
}
