import React from 'react';

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="auth-backdrop">
                    <div className="auth-modal" style={{ textAlign: 'center' }}>
                        <h2>Something went wrong.</h2>
                        <p className="auth-copy">An unexpected error occurred in the application.</p>
                        <button 
                            className="auth-submit" 
                            onClick={() => window.location.reload()}
                            style={{ marginTop: '1rem' }}
                        >
                            Reload page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
