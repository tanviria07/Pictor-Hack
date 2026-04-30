import { useState } from "react";
import { login, resendOtp, signup, verifyEmail } from "../../lib/api";
import { formatThrownError } from "../../lib/errors";

export function AuthModal({ mode, onClose, onAuthed }) {
    const [activeMode, setActiveMode] = useState(mode || "login");
    const [username, setUsername] = useState("");
    const [identifier, setIdentifier] = useState("");
    const [email, setEmail] = useState("");
    const [pendingEmail, setPendingEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [verificationExpiresAt, setVerificationExpiresAt] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const isVerifying = activeMode === "verify";
    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setNotice("");
        try {
            if (activeMode === "signup") {
                const response = await signup({ email, username, password });
                setPendingEmail(response.email || email);
                setVerificationExpiresAt(response.expires_at || "");
                setOtp("");
                setActiveMode("verify");
                setNotice("Check your email for a 6-digit verification code.");
                return;
            }
            const response = activeMode === "verify"
                ? await verifyEmail({ email: pendingEmail || email, otp })
                : await login({ identifier, password });
            onAuthed(response.user);
        }
        catch (err) {
            setError(formatThrownError(err));
        }
        finally {
            setBusy(false);
        }
    };
    const resend = async () => {
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const response = await resendOtp({ email: pendingEmail || email });
            setVerificationExpiresAt(response.expires_at || "");
            setNotice("A new verification code was sent.");
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
          <h2>{activeMode === "signup" ? "Create account" : isVerifying ? "Verify email" : "Log in"}</h2>
          <button type="button" className="auth-close" onClick={onClose}>Close</button>
        </div>
        <p className="auth-copy">{isVerifying ? `Enter the 6-digit code sent to ${pendingEmail || email}.` : "Use a local Kitkode account with an HTTP-only session cookie."}</p>
        {isVerifying ? (<>
          <label className="auth-label" htmlFor="auth-otp">Verification code</label>
          <input id="auth-otp" className="auth-input" type="text" inputMode="numeric" pattern="[0-9]{6}" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" minLength={6} maxLength={6} required />
          {verificationExpiresAt && <p className="auth-copy">Code expires at {new Date(verificationExpiresAt).toLocaleTimeString()}.</p>}
        </>) : activeMode === "signup" ? (<>
          <label className="auth-label" htmlFor="auth-email">Email</label>
          <input id="auth-email" className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          <label className="auth-label" htmlFor="auth-username">Username</label>
          <input id="auth-username" className="auth-input" type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" minLength={3} maxLength={32} required />
        </>) : (<>
          <label className="auth-label" htmlFor="auth-identifier">Email or username</label>
          <input id="auth-identifier" className="auth-input" type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
        </>)}
        {!isVerifying && (<>
          <label className="auth-label" htmlFor="auth-password">Password</label>
          <input id="auth-password" className="auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={activeMode === "signup" ? "new-password" : "current-password"} minLength={8} required />
        </>)}
        {notice && <p className="auth-copy">{notice}</p>}
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? "Working..." : activeMode === "signup" ? "Sign up" : isVerifying ? "Verify and log in" : "Log in"}</button>
        {isVerifying ? (<>
          <button type="button" className="auth-switch" onClick={resend} disabled={busy}>Resend code</button>
          <button type="button" className="auth-switch" onClick={() => setActiveMode("login")}>Back to login</button>
        </>) : (<button type="button" className="auth-switch" onClick={() => setActiveMode(activeMode === "signup" ? "login" : "signup")}>
          {activeMode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}
        </button>)}
      </form>
    </div>);
}
