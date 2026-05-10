import { useEffect, useState } from "react";
import { forgotPassword, login, register, resetPassword, verifyEmail, verifyToken } from "../../lib/api";
import { formatThrownError } from "../../lib/errors";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AuthShell({ title, copy, children }) {
    return (
        <div className="auth-backdrop auth-page">
            <div className="auth-modal">
                <div className="auth-head">
                    <h2>{title}</h2>
                    <a className="auth-close" href="/login">Login</a>
                </div>
                <p className="auth-copy">{copy}</p>
                {children}
            </div>
        </div>
    );
}

export function LoginPage({ onAuthed }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (!emailPattern.test(email) || password.length < 8) {
            setError("Enter a valid email and password.");
            return;
        }
        setBusy(true);
        try {
            const response = await login({ email, password });
            onAuthed(response.user);
        }
        catch (err) {
            setError(formatThrownError(err));
        }
        finally {
            setBusy(false);
        }
    };
    return (
        <AuthShell title="Log in" copy="Use your KitCode account to continue practicing.">
            <form onSubmit={submit}>
                <label className="auth-label" htmlFor="login-email">Email</label>
                <input id="login-email" className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                <label className="auth-label" htmlFor="login-password">Password</label>
                <input id="login-password" className="auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" minLength={8} required />
                {error && <p className="auth-error">{error}</p>}
                <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Logging in..." : "Log in"}</button>
            </form>
            <a className="auth-switch" href="/register">Create an account</a>
            <a className="auth-switch" href="/reset-password">Reset password</a>
        </AuthShell>
    );
}

export function RegisterPage({ onAuthed }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [pendingEmail, setPendingEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const submit = async (e) => {
        e.preventDefault();
        setError("");
        setNotice("");
        if (pendingEmail) {
            if (otp.length !== 6) {
                setError("Enter the 6-digit verification code.");
                return;
            }
            setBusy(true);
            try {
                const response = await verifyEmail({ email: pendingEmail, otp });
                onAuthed?.(response.user);
            }
            catch (err) {
                setError(formatThrownError(err));
            }
            finally {
                setBusy(false);
            }
            return;
        }
        if (!emailPattern.test(email) || password.length < 8) {
            setError("Use a valid email and a password of at least 8 characters.");
            return;
        }
        setBusy(true);
        try {
            const response = await register({ email, password });
            setPendingEmail(response.email || email);
            setNotice(response.expires_at
                ? "Check the backend console or email output for your 6-digit verification code."
                : "Check the backend console or email output for your verification link.");
        }
        catch (err) {
            setError(formatThrownError(err));
        }
        finally {
            setBusy(false);
        }
    };
    return (
        <AuthShell title="Create account" copy="Email verification is required before login.">
            <form onSubmit={submit}>
                {pendingEmail ? (
                    <>
                        <label className="auth-label" htmlFor="register-otp">Verification code</label>
                        <input id="register-otp" className="auth-input" type="text" inputMode="numeric" pattern="[0-9]{6}" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" minLength={6} maxLength={6} required />
                    </>
                ) : (
                    <>
                        <label className="auth-label" htmlFor="register-email">Email</label>
                        <input id="register-email" className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                        <label className="auth-label" htmlFor="register-password">Password</label>
                        <input id="register-password" className="auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
                    </>
                )}
                {notice && <p className="auth-copy">{notice}</p>}
                {error && <p className="auth-error">{error}</p>}
                <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Working..." : pendingEmail ? "Verify account" : "Create account"}</button>
            </form>
            <a className="auth-switch" href="/login">Already have an account?</a>
        </AuthShell>
    );
}

export function VerifyPage({ onAuthed }) {
    const [message, setMessage] = useState("Verifying...");
    const [error, setError] = useState("");
    useEffect(() => {
        const token = new URLSearchParams(window.location.search).get("token") || "";
        if (!token) {
            setMessage("");
            setError("Verification token is missing.");
            return;
        }
        (async () => {
            try {
                const response = await verifyToken({ token });
                setMessage("Email verified. You can log in now.");
                onAuthed?.(response.user, false);
            }
            catch (err) {
                setMessage("");
                setError(formatThrownError(err));
            }
        })();
    }, [onAuthed]);
    return (
        <AuthShell title="Verify email" copy="Completing your account verification.">
            {message && <p className="auth-copy">{message}</p>}
            {error && <p className="auth-error">{error}</p>}
            <a className="auth-submit" href="/login">Continue to login</a>
        </AuthShell>
    );
}

export function ResetPasswordPage() {
    const token = new URLSearchParams(window.location.search).get("token") || "";
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const submit = async (e) => {
        e.preventDefault();
        setError("");
        setNotice("");
        setBusy(true);
        try {
            if (token) {
                if (password.length < 8) {
                    setError("Password must be at least 8 characters.");
                    return;
                }
                await resetPassword({ token, new_password: password });
                setNotice("Password updated. You can log in now.");
            }
            else {
                if (!emailPattern.test(email)) {
                    setError("Enter a valid email address.");
                    return;
                }
                await forgotPassword({ email });
                setNotice("Check the backend console or email output for your reset link.");
            }
        }
        catch (err) {
            setError(formatThrownError(err));
        }
        finally {
            setBusy(false);
        }
    };
    return (
        <AuthShell title="Reset password" copy={token ? "Choose a new password." : "Request a password reset link."}>
            <form onSubmit={submit}>
                {token ? (
                    <>
                        <label className="auth-label" htmlFor="reset-password">New password</label>
                        <input id="reset-password" className="auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
                    </>
                ) : (
                    <>
                        <label className="auth-label" htmlFor="reset-email">Email</label>
                        <input id="reset-email" className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                    </>
                )}
                {notice && <p className="auth-copy">{notice}</p>}
                {error && <p className="auth-error">{error}</p>}
                <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Working..." : token ? "Update password" : "Send reset link"}</button>
            </form>
        </AuthShell>
    );
}
