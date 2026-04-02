import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // The location state saves where the user was trying to go
    const from = location.state?.from?.pathname || "/";

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await login(username, password);
            // Redirect to the original page or dashboard
            navigate(from, { replace: true });
        } catch (err) {
            setError(err.message || 'Invalid username or password');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-glass-card">
                <div className="login-header">
                    <div className="login-logo">
                        <div className="logo-icon"></div>
                        <span>Final Major</span>
                    </div>
                    <h1>Welcome Back</h1>
                    <p>Enter your credentials to access the terminal</p>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    {error && <div className="login-error-msg">{error}</div>}

                    <div className="login-input-group">
                        <label htmlFor="username">Username</label>
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="e.g. admin"
                            required
                            disabled={isLoading}
                        />
                    </div>

                    <div className="login-input-group">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            disabled={isLoading}
                        />
                    </div>

                    <button
                        type="submit"
                        className={`login-submit-btn ${isLoading ? 'loading' : ''}`}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Verifying...' : 'Login to Dashboard'}
                    </button>
                </form>

                <div className="login-footer">
                    <span>Contact support if you've forgotten your password</span>
                </div>
            </div>
        </div>
    );
};

export default Login;
