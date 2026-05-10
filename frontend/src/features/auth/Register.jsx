import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { register } from "../../lib/api";
import { formatThrownError } from "../../lib/errors";

export function Register() {
    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [fullName, setFullName] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async (event) => {
        event.preventDefault();
        setError("");
        if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username.trim()) || password.length < 8) {
            setError("Username must be 3-32 letters, numbers, underscores, or hyphens. Password must be at least 8 characters.");
            return;
        }
        setBusy(true);
        try {
            await register({ username, full_name: fullName, password });
            navigate("/login", { replace: true });
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
                    <h2>Create account</h2>
                </div>
                <p className="auth-copy">Create a local KitCode account. No email verification is required.</p>
                <label className="auth-label" htmlFor="register-username">Username</label>
                <input id="register-username" className="auth-input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" minLength={3} maxLength={32} required />
                <label className="auth-label" htmlFor="register-full-name">Full name</label>
                <input id="register-full-name" className="auth-input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
                <label className="auth-label" htmlFor="register-password">Password</label>
                <input id="register-password" className="auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
                {error && <p className="auth-error">{error}</p>}
                <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Creating..." : "Create account"}</button>
                <Link className="auth-switch" to="/login">Already have an account?</Link>
            </form>
        </div>
    );
}
