import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { login } from "../../lib/api";
import { formatThrownError } from "../../lib/errors";

export function Login({ onLogin }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const from = location.state?.from?.pathname || "/";

    const submit = async (event) => {
        event.preventDefault();
        setError("");
        if (username.trim().length < 3 || password.length < 8) {
            setError("Enter your username and password.");
            return;
        }
        setBusy(true);
        try {
            await login({ username, password });
            await onLogin();
            navigate(from, { replace: true });
        }
        catch (err) {
            setError(formatThrownError(err));
        }
        finally {
            setBusy(false);
        }
    };

    return (
        <div className="auth-backdrop auth-page">
            <form className="auth-modal" onSubmit={submit}>
                <div className="auth-head">
                    <h2>Log in</h2>
                </div>
                <p className="auth-copy">Use your KitCode username and password.</p>
                <label className="auth-label" htmlFor="login-username">Username</label>
                <input id="login-username" className="auth-input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
                <label className="auth-label" htmlFor="login-password">Password</label>
                <input id="login-password" className="auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" minLength={8} required />
                {error && <p className="auth-error">{error}</p>}
                <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Logging in..." : "Log in"}</button>
                <Link className="auth-switch" to="/register">Create an account</Link>
            </form>
        </div>
    );
}
