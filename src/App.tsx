/**
 * ROKI - APP SHELL
 * Sidebar navigation (drawer on phones), engine status and controls, and the pages.
 * The page lives in the URL hash (#/review) so refresh and back keep your place.
 */
import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { ArrowLeftRight, BookOpenCheck, GraduationCap, LayoutDashboard, LogOut, Menu, RefreshCw, Ruler, ShieldAlert, ShieldCheck, Target, Wallet, X } from "lucide-react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "./lib/firebase";
import type { EngineView } from "./types";
import { LoginGate } from "./components/LoginGate";
import { RokiMark, RokiWordmark } from "./components/RokiMark";
import { Overview } from "./pages/Overview";
import { Review } from "./pages/Review";
import { Learning } from "./pages/Learning";
import { Account } from "./pages/Account";
import { Levels, Predictions, Rules, Trades } from "./pages/Data";
import { inr, timeIST } from "./ui/kit";

const ADMIN_EMAIL = "chijobha@gmail.com";
type PageId = "overview" | "review" | "learning" | "predictions" | "account" | "trades" | "levels" | "rules";
const NAV: { group: string; items: [PageId, string, ComponentType<{ className?: string }>][] }[] = [
  { group: "", items: [["overview", "Overview", LayoutDashboard], ["review", "Trade review", BookOpenCheck], ["learning", "Learning", GraduationCap], ["predictions", "Predictions", Target]] },
  { group: "Trading", items: [["account", "Options account", Wallet], ["trades", "Trades", ArrowLeftRight], ["levels", "Levels", Ruler]] },
  { group: "System", items: [["rules", "Rules & safety", ShieldCheck]] },
];
const ALL = NAV.flatMap((g) => g.items.map(([id]) => id));
const fromHash = (): PageId => { const h = window.location.hash.replace(/^#\/?/, "") as PageId; return ALL.includes(h) ? h : "overview"; };

function useRoute(): [PageId, (p: PageId) => void] {
  const [page, setPage] = useState<PageId>(fromHash);
  useEffect(() => { const on = () => setPage(fromHash()); window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  return [page, (p) => { window.location.hash = `/${p}`; window.scrollTo({ top: 0 }); }];
}

function SideNav({ page, go, view, onSignOut, extra }: { page: PageId; go: (p: PageId) => void; view: EngineView; onSignOut: () => void; extra?: ReactNode }) {
  return (
    <nav aria-label="Main" className="flex h-full flex-col">
      <a href="#/overview" onClick={(e) => { e.preventDefault(); go("overview"); }} className="flex items-center px-4 h-16 shrink-0" aria-label="Roki home">
        <RokiWordmark />
      </a>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {NAV.map((g) => (
          <div key={g.group || "main"} className="mt-3">
            {g.group && <div className="px-3 pb-1 text-xs font-medium text-ink-3">{g.group}</div>}
            <ul className="space-y-0.5">
              {g.items.map(([id, label, Icon]) => {
                const on = id === page;
                return (
                  <li key={id}>
                    <a href={`#/${id}`} aria-current={on ? "page" : undefined} onClick={(e) => { e.preventDefault(); go(id); }}
                      className={`flex items-center gap-2.5 h-9 px-3 rounded-[10px] text-[14px] transition-colors ${on ? "bg-surface text-ink font-medium shadow-[0_0_0_1px_var(--line),0_4px_12px_-6px_rgb(84_56_28/.18)]" : "text-ink-2 hover:bg-[color-mix(in_srgb,var(--sunken)_70%,transparent)] hover:text-ink"}`}>
                      <Icon className={`w-[17px] h-[17px] ${on ? "text-roki" : ""}`} />{label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line p-3 space-y-2">
        <div className={`flex items-center gap-2 text-[13px] ${view.liveEnabled ? "text-loss" : "text-ink-2"}`}>
          <span className={`w-2 h-2 rounded-full ${view.liveEnabled ? "bg-loss" : "bg-roki"}`} />{view.liveEnabled ? "Real orders on" : "Paper money only"}
        </div>
        {extra}
        <button className="btn btn-ghost w-full justify-start px-2" onClick={onSignOut}><LogOut />Sign out</button>
      </div>
    </nav>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<EngineView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [page, setPage] = useRoute();
  const go = (p: PageId) => { setPage(p); setDrawer(false); };

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u && u.email === ADMIN_EMAIL ? u : null); setChecking(false); }), []);

  const api = useCallback(async (path: string, body?: object) => {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `The server answered ${res.status}. Try again in a minute.`);
    return data;
  }, []);
  const refresh = useCallback(async () => { try { setView(await api("/api/state")); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }, [api]);
  useEffect(() => { if (!user) return; refresh(); const t = setInterval(refresh, 30000); return () => clearInterval(t); }, [user, refresh]);
  useEffect(() => { document.title = view ? `${NAV.flatMap((g) => g.items).find(([id]) => id === page)?.[1]} · Roki` : "Roki"; }, [page, view]);

  const act = async (label: string, path: string, body: object = {}) => {
    setBusy(label);
    try { await api(path, body); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };

  if (checking) return <div className="min-h-screen bg-canvas" />;
  if (!user) return <LoginGate onLogin={setUser} />;
  if (!view) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-3 px-4 text-center">
        <RokiMark className="w-10 h-10 animate-pulse" />
        <p className="text-[14px] text-ink-2">{error ? error : "Loading Roki…"}</p>
        {error && <button className="btn btn-secondary" onClick={refresh}><RefreshCw />Try again</button>}
      </div>
    );
  }

  const age = view.lastRun ? (Date.now() - Date.parse(view.lastRun)) / 60000 : Infinity;
  const fresh = age < 12;
  const pageEl = {
    overview: <Overview view={view} />, review: <Review view={view} />, learning: <Learning view={view} />, predictions: <Predictions view={view} />,
    account: <Account api={api} />, trades: <Trades view={view} />, levels: <Levels view={view} />, rules: <Rules view={view} />,
  }[page];
  const doSignOut = () => signOut(auth);

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-60 border-r border-line bg-[color-mix(in_srgb,var(--sunken)_45%,var(--canvas))]">
        <SideNav page={page} go={go} view={view} onSignOut={doSignOut} />
      </aside>

      {drawer && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-[rgb(10_12_20/.45)]" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-canvas border-r border-line shadow-xl">
            <button className="btn btn-ghost absolute right-2 top-3 w-8 px-0" aria-label="Close menu" onClick={() => setDrawer(false)}><X /></button>
            <SideNav page={page} go={go} view={view} onSignOut={doSignOut} extra={
              <button className={`btn ${view.killSwitch ? "btn-secondary" : "btn-danger"} w-full`} disabled={!!busy} onClick={() => act("kill", "/api/kill", { on: !view.killSwitch })}><ShieldAlert />{view.killSwitch ? "Turn off kill switch" : "Kill switch"}</button>} />
          </div>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 h-16 border-b border-line bg-[color-mix(in_srgb,var(--canvas)_80%,transparent)] backdrop-blur-xl">
          <div className="h-full max-w-[1200px] mx-auto px-4 md:px-8 flex items-center gap-3">
            <button className="btn btn-ghost lg:hidden w-8 px-0 -ml-1" aria-label="Open menu" onClick={() => setDrawer(true)}><Menu /></button>
            <RokiWordmark size="sm" className="lg:hidden" />
            <div className="hidden sm:flex items-center gap-2 text-[13px] text-ink-2" title={view.lastRun ? `Last engine run ${new Date(view.lastRun).toLocaleString("en-IN")}` : undefined}>
              <span className="relative flex w-2 h-2">
                {fresh && <span className="absolute inline-flex h-full w-full rounded-full bg-gain opacity-60 animate-ping" />}
                <span className={`relative inline-flex w-2 h-2 rounded-full ${fresh ? "bg-gain" : "bg-ink-3"}`} />
              </span>
              {fresh ? "Engine running" : "Engine idle"} · updated {view.lastRun ? timeIST(Date.parse(view.lastRun)) : "—"}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {view.killSwitch && <span className="badge badge-loss">Kill switch on</span>}
              <button className={`btn ${view.killSwitch ? "btn-secondary" : "btn-danger"} hidden sm:inline-flex`} disabled={!!busy} onClick={() => act("kill", "/api/kill", { on: !view.killSwitch })}
                title="Stops every new trade, paper and live, until you turn it off."><ShieldAlert />{view.killSwitch ? "Turn off kill switch" : "Kill switch"}</button>
              {view.envLive && view.brokerConfigured && (
                <button className={`btn ${view.liveEnabled ? "btn-secondary" : "btn-danger"}`} disabled={!!busy}
                  onClick={() => { if (view.liveEnabled || window.confirm(`Send REAL Dhan orders?\n\nFor each counted Indian trade the app buys ${view.risk.optionLots} lot of the at-the-money option. You can lose the whole premium (up to ${inr(view.risk.maxPremiumPerTradeInr, false)} a trade). At most ${view.risk.maxLiveTradesPerDay} trade a day; no new trades after a ${inr(view.risk.dailyLossLimitInr, false)} loss.`)) act("live", "/api/live", { enabled: !view.liveEnabled }); }}>
                  {view.liveEnabled ? "Back to paper" : "Go live"}
                </button>
              )}
              <button className="btn btn-primary" disabled={!!busy} onClick={() => act("run", "/api/run")}><RefreshCw className={busy === "run" ? "animate-spin" : ""} />{busy === "run" ? "Running…" : "Run now"}</button>
            </div>
          </div>
        </header>

        <main className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 md:py-8">
          {(error || view.lastError) && (
            <div role="alert" className="mb-4 rounded-lg border border-[color-mix(in_srgb,var(--loss)_30%,var(--line))] bg-loss-soft px-4 py-3 text-[14px] text-loss">{error || `Last engine run had a problem: ${view.lastError}`}</div>
          )}
          {pageEl}
          <footer className="mt-12 pt-6 border-t border-line flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-ink-3">
            <span>Roki trades paper money only. Nothing here is investment advice.</span>
            <span className="sm:ml-auto">Every trade, right and wrong, stays on record.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
