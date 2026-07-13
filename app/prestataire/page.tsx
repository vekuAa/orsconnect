import { AppPage } from "@/components/app-page";
import { ProviderPortal } from "@/components/provider-portal";

export default function ProviderPortalPage() {
  return (
    <AppPage allowedRoles={["prestataire"]}>
      <ProviderPortal />
    </AppPage>
  );
}
