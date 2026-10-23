import { App } from "@/components/app";
import { Suspense } from "react";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Keep the existing authentication, workspace and unsaved-note state alive
  // while Next.js navigates between the overview and the profile.
  return (
    <>
      <Suspense>
        <App />
      </Suspense>
      {children}
    </>
  );
}
