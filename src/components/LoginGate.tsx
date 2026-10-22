/**
 * ROKI - sign in. Only the owner's Google account can open the dashboard.
 */
import { useState } from "react";
import { RokiMark } from "./RokiMark";
import { auth } from "../lib/firebase";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

export const LoginGate = ({ onLogin }: { onLogin: (user: any) => void }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const { user } = await signInWithPopup(auth, new GoogleAuthProvider());
      if (user.email === "chijobha@gmail.com") onLogin(user);
      else {
        await signOut(auth);
        setError(`${user.email} can't open this dashboard. Sign in with the owner's Google account.`);
      }
    } catch {
      setError("Sign-in didn't finish. Check that pop-ups are allowed, then try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper text-ink flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <RokiMark className="w-20 h-20 mx-auto" />
        <h1 className="mt-6 font-display text-5xl font-bold tracking-tight">roki</h1>
        <p className="mt-3 text-lg text-muted-foreground">An AI learning to trade, in public. Every prediction, every trade, every lesson.</p>
        <button onClick={signIn} disabled={loading}
          className="btn-primary mt-8 w-full py-3.5 rounded-full text-base font-medium inline-flex items-center justify-center gap-3 disabled:opacity-60">
          <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {loading ? "Signing in…" : "Sign in with Google"}
        </button>
        {error && <p role="alert" className="mt-4 text-sm text-loss bg-loss-soft rounded-xl px-4 py-3">{error}</p>}
        <p className="mt-10 text-xs text-muted-foreground">Paper money only. Nothing here is investment advice.</p>
      </div>
    </div>
  );
};
