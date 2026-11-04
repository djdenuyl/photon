import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { DesktopHeader, MobileHeader, TabBar, useIsDesktop } from "@/components/Shell";
import { ApiError, fetchJson, type Me } from "@/lib/api";
import { YEAR } from "@/lib/data";
import { GuidePage } from "@/pages/GuidePage";
import { LoginPage } from "@/pages/LoginPage";
import { PlanPage } from "@/pages/PlanPage";
import { YearPage } from "@/pages/YearPage";

// The query cache is persisted so the app paints at once from the last known data.
const CACHE_MAX_AGE = 7 * 24 * 3_600_000;
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, gcTime: CACHE_MAX_AGE, networkMode: "offlineFirst" } },
});
const persister = createSyncStoragePersister({ storage: window.localStorage, key: "photon-cache" });

function AuthGate({ children }: { children: (me: Me) => ReactNode }) {
  const me = useQuery<Me, Error>({
    queryKey: ["me"],
    queryFn: () => fetchJson<Me>("/api/auth/me"),
    retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 1,
    networkMode: "always",
  });
  if (me.isPending) return <div className="flex min-h-dvh items-center justify-center text-muted">…</div>;
  if (me.error instanceof ApiError && me.error.status === 401) return <LoginPage />;
  return <>{children(me.data ?? { email: "", name: null })}</>;
}

function Layout({ me }: { me: Me }) {
  const desktop = useIsDesktop();
  const { pathname } = useLocation();
  return (
    <>
      {desktop ? <DesktopHeader me={me} /> : <MobileHeader me={me} />}
      <main key={pathname} className={desktop ? "" : "pb-20"}>
        <Routes>
          <Route path="/" element={<Navigate to={`/boek/${YEAR}`} replace />} />
          <Route path="/boek/:year" element={<YearPage />} />
          <Route path="/indeling" element={<PlanPage />} />
          <Route path="/gids" element={<GuidePage />} />
          <Route path="*" element={<Navigate to={`/boek/${YEAR}`} replace />} />
        </Routes>
      </main>
      {!desktop && <TabBar />}
    </>
  );
}

export function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        // `me` is never persisted (a stale login must not skip the gate), nor the year data
        // (a few MB; the service worker caches the files themselves)
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => q.queryKey[0] === "state" && q.state.status === "success",
        },
      }}
    >
      <BrowserRouter>
        <AuthGate>{(me) => <Layout me={me} />}</AuthGate>
      </BrowserRouter>
    </PersistQueryClientProvider>
  );
}
