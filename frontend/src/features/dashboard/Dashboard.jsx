import { useEffect, useState } from "react";
import { deleteMyAccount, exportMyProgress, getMyDashboard, resetMyProgress } from "../../lib/api";
import { formatThrownError } from "../../lib/errors";

function ProgressBar({ item }) {
    const pct = item.total > 0 ? Math.round((item.solved / item.total) * 100) : 0;
    return (<div className="dash-progress-row">
      <div className="dash-progress-meta">
        <span>{item.title}</span>
        <span>{item.solved}/{item.total}</span>
      </div>
      <div className="dash-bar"><div style={{ width: `${pct}%` }} /></div>
    </div>);
}

export function Dashboard({ user, onBack, onLogout }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await getMyDashboard();
                if (!cancelled)
                    setData(response);
            }
            catch (err) {
                if (!cancelled)
                    setError(formatThrownError(err));
            }
        })();
        return () => { cancelled = true; };
    }, []);
    const doExport = async () => {
        const exported = await exportMyProgress();
        const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "kitkode-progress.json";
        a.click();
        URL.revokeObjectURL(url);
    };
    const doReset = async () => {
        await resetMyProgress();
        setData(await getMyDashboard());
    };
    const doDelete = async () => {
        await deleteMyAccount();
        onLogout();
    };
    if (error) {
        return <div className="dash"><div className="ws-alert">{error}</div><button className="btn-reset" onClick={onBack}>Back to practice</button></div>;
    }
    if (!data) {
        return <div className="dash"><p className="pp-loading">Loading dashboard...</p></div>;
    }
    return (<div className="dash">
      <header className="dash-header">
        <div>
          <h1>Dashboard</h1>
          <p>{user?.email}</p>
        </div>
        <div className="dash-actions">
          <button className="btn-hint" onClick={onBack}>Practice</button>
          <button className="btn-reset" onClick={onLogout}>Log out</button>
        </div>
      </header>
      <main className="dash-scroll">
        <section className="dash-hero">
          <div><span className="dash-stat">{data.solved_count}</span><span className="dash-label">solved</span></div>
          <div><span className="dash-stat">{data.total_problems}</span><span className="dash-label">problems</span></div>
          <div><span className="dash-stat">{data.practice_activity_days}</span><span className="dash-label">active days</span></div>
          <div><span className="dash-stat">{data.practice_streak_days}</span><span className="dash-label">day streak</span></div>
        </section>
        <section className="dash-grid">
          <div className="dash-panel"><h2>Progress by Track</h2>{data.progress_by_track.map((item) => <ProgressBar key={item.id} item={item} />)}</div>
          <div className="dash-panel"><h2>Progress by Category</h2>{data.progress_by_category.slice(0, 12).map((item) => <ProgressBar key={item.id} item={item} />)}</div>
          <div className="dash-panel"><h2>Recent Attempts</h2>{data.recent_attempts.length === 0 ? <p className="dash-empty">No attempts yet.</p> : data.recent_attempts.map((a) => <p key={a.id} className="dash-list-row"><span>{a.problem_id}</span><span>{a.status}</span></p>)}</div>
          <div className="dash-panel"><h2>Weak Areas</h2>{data.weak_areas.length === 0 ? <p className="dash-empty">No weak areas yet.</p> : data.weak_areas.map((a) => <p key={a.category} className="dash-list-row"><span>{a.category}</span><span>{a.wrong_or_partial_attempts}</span></p>)}</div>
          <div className="dash-panel"><h2>Recommended Next</h2>{data.recommended_problems.map((p) => <p key={p.id} className="dash-rec"><strong>{p.title}</strong><span>{p.reason} · {p.track}</span></p>)}</div>
          <div className="dash-panel"><h2>Role Mode</h2>{data.role_mode_summary.length === 0 ? <p className="dash-empty">No role-mode attempts yet.</p> : data.role_mode_summary.map((r) => <p key={r.role} className="dash-list-row"><span>{r.role}</span><span>{r.attempt_count}</span></p>)}</div>
          <div className="dash-panel dash-panel--wide"><h2>Settings</h2><div className="dash-settings"><button className="btn-hint" onClick={() => void doExport()}>Export my progress</button><button className="btn-hint" onClick={() => void doReset()}>Reset my progress</button><button className="btn-reset" onClick={() => void doDelete()}>Delete my account</button></div></div>
        </section>
      </main>
    </div>);
}
