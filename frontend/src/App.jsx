import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Workspace } from "./components/Workspace";
import { Dashboard } from "./features/dashboard/Dashboard";
import { Login } from "./features/auth/Login";
import { Register } from "./features/auth/Register";
import { getAuthToken, getMe, logout } from "./lib/api";
import { ErrorBoundary } from "./components/ErrorBoundary";

function ProtectedRoute({ user, checkingSession, children }) {
    const location = useLocation();
    if (checkingSession) {
        return <div className="auth-backdrop"><div className="auth-modal"><p className="auth-copy">Loading session...</p></div></div>;
    }
    if (!user) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }
    return children;
}

function AppRoutes() {
    const [user, setUser] = useState(null);
    const [checkingSession, setCheckingSession] = useState(true);
    const navigate = useNavigate();

    const restoreSession = useCallback(async () => {
        if (!getAuthToken()) {
            setUser(null);
            setCheckingSession(false);
            return null;
        }
        const response = await getMe();
        setUser(response ?? null);
        setCheckingSession(false);
        return response;
    }, []);

    useEffect(() => {
        void restoreSession();
    }, [restoreSession]);

    const onLogout = async () => {
        await logout();
        setUser(null);
        navigate("/login", { replace: true });
    };

    return (
        <Routes>
            <Route path="/login" element={<Login onLogin={restoreSession} />} />
            <Route path="/register" element={<Register />} />
            <Route path="/dashboard" element={(
                <ProtectedRoute user={user} checkingSession={checkingSession}>
                    <Dashboard user={user} onBack={() => navigate("/")} onLogout={onLogout} />
                </ProtectedRoute>
            )} />
            <Route path="/" element={(
                <ProtectedRoute user={user} checkingSession={checkingSession}>
                    <Workspace user={user} onAuth={() => navigate("/login")} onDashboard={() => navigate("/dashboard")} onLogout={onLogout} />
                </ProtectedRoute>
            )} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <ErrorBoundary>
                <AppRoutes />
            </ErrorBoundary>
        </BrowserRouter>
    );
}
