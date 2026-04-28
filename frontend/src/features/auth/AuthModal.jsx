import { useState } from "react";
import { login, signup } from "../../lib/api";
import { formatThrownError } from "../../lib/errors";

export function AuthModal({ mode, onClose, onAuthed }) {
    const [activeMode, setActiveMode] = useState(mode || "login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            const response = activeMode === "signup"
                ? await signup({ email, password })
                : await login({ email, password });
            onAuthed(response.user);
        }
        catch (err) {
            setError(formatThrownError(err));
        }
        finally {
            setBusy(false);
        }
    };
    return (<div className="auth-backdrop" role="presentation">
      <form className="auth-modal" onSubmit={submit}>
        <div className="auth-head">
          <h2>{activeMode === "signup" ? "Create account" : "Log in"}</h2>
          <button type="button" className="auth-close" onClick={onClose}>Close</button>
        </div>
        <label className="auth-label" htmlFor="auth-email">Email</label>
        <input id="auth-email" className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <label className="auth-label" htmlFor="auth-password">Password</label>
        <input id="auth-password" className="auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={activeMode === "signup" ? "new-password" : "current-password"} minLength={8} required />
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? "Working..." : activeMode === "signup" ? "Sign up" : "Log in"}</button>
        <button type="button" className="auth-switch" onClick={() => setActiveMode(activeMode === "signup" ? "login" : "signup")}>
          {activeMode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}
        </button>
      </form>
    </div>);
}
