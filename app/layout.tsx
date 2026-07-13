import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ORS Connect",
  description: "Pilotage opérationnel des prestations automobiles ORS",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
