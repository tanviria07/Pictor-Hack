import { useEffect, useState } from "react";
import { Workspace } from "./components/Workspace";
import { AuthModal } from "./features/auth/AuthModal";
import { Dashboard } from "./features/dashboard/Dashboard";
import { getMe, logout } from "./lib/api";

export default function App() {
    const [user, setUser] = useState(null);
    const [authMode, setAuthMode] = useState(null);
    const [route, setRoute] = useState(() => window.location.pathname === "/dashboard" ? "dashboard" : "practice");
    useEffect(() => {
        (async () => {
            const response = await getMe();
            setUser(response?.user ?? null);
        })();
    }, []);
    const goDashboard = () => {
        window.history.pushState({}, "", "/dashboard");
        setRoute("dashboard");
    };
    const goPractice = () => {
        window.history.pushState({}, "", "/");
        setRoute("practice");
    };
    const onLogout = async () => {
        try {
            await logout();
        }
        catch {
            /* non-fatal */
        }
        setUser(null);
        goPractice();
    };
    if (route === "dashboard") {
        if (!user) {
            return (<>
              <Workspace user={user} onAuth={setAuthMode} onDashboard={goDashboard} onLogout={onLogout} />
              <AuthModal mode="login" onClose={goPractice} onAuthed={(nextUser) => { setUser(nextUser); setAuthMode(null); }} />
            </>);
        }
        return <Dashboard user={user} onBack={goPractice} onLogout={onLogout} />;
    }
    return (<>
      <Workspace user={user} onAuth={setAuthMode} onDashboard={goDashboard} onLogout={onLogout} />
      {authMode && <AuthModal mode={authMode} onClose={() => setAuthMode(null)} onAuthed={(nextUser) => { setUser(nextUser); setAuthMode(null); }} />}
    </>);
}
