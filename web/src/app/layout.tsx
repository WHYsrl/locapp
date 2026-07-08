import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import Shell from "@/components/Shell";
import { ExportJobsProvider } from "@/lib/exportJobs";
import { WorkContextProvider } from "@/lib/workContext";

export const metadata: Metadata = {
  title: "VenueScout",
  description: "Piattaforma di scouting location per agenzie di eventi",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="antialiased">
        <Providers>
          <WorkContextProvider>
            <ExportJobsProvider>
              <Shell>{children}</Shell>
            </ExportJobsProvider>
          </WorkContextProvider>
        </Providers>
      </body>
    </html>
  );
}
