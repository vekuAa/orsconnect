import type { Role } from "@/lib/types";

export const roleHome: Record<Role, string> = {
  admin: "/dashboard",
  directeur: "/dashboard",
  concession: "/concession",
  prestataire: "/prestataire",
};

export function canRoleAccessPath(role: Role, pathname: string) {
  if (pathname.startsWith("/auth/") || pathname === "/login" || pathname === "/setup") {
    return true;
  }

  if (role === "admin") return true;

  if (role === "directeur") {
    return ["/dashboard", "/vehicles", "/concessions", "/finances"].some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
  }

  if (role === "concession") {
    return ["/concession", "/vehicles"].some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
  }

  return ["/prestataire", "/vehicles"].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}
