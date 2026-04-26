import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const from = location.state?.from?.pathname || "/terminal";

    useEffect(() => {
        // Ensure the light/dark mode root class is correct for BullPeak
        document.documentElement.classList.add('dark');
        return () => document.documentElement.classList.remove('dark');
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            // Note: Mapping 'email' state to 'username' backend logic
            await login(email, password);
            navigate(from, { replace: true });
        } catch (err) {
            setError(err.message || 'Invalid credentials. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-page-wrapper">
            {/* Background Decorative Elements */}
            <div className="grid-overlay"></div>
            <div className="glow-orb glow-orb-primary"></div>
            <div className="glow-orb glow-orb-secondary"></div>

            {/* Synthetic Candlestick Background Art */}
            <div className="candlestick-blur-container">
                <div className="candlestick-group">
                    <div className="wick bullish" style={{ height: '5rem' }}></div>
                    <div className="body bullish" style={{ height: '10rem' }}></div>
                    <div className="wick bullish" style={{ height: '3rem' }}></div>
                </div>
                <div className="candlestick-group" style={{ marginTop: '8rem' }}>
                    <div className="wick bearish" style={{ height: '4rem' }}></div>
                    <div className="body bearish" style={{ height: '8rem' }}></div>
                    <div className="wick bearish" style={{ height: '2rem' }}></div>
                </div>
                <div className="candlestick-group" style={{ marginTop: '-5rem' }}>
                    <div className="wick bullish" style={{ height: '6rem' }}></div>
                    <div className="body bullish" style={{ height: '14rem' }}></div>
                    <div className="wick bullish" style={{ height: '4rem' }}></div>
                </div>
                <div className="candlestick-group hidden-sm" style={{ marginTop: '3rem' }}>
                    <div className="wick bearish" style={{ height: '3rem' }}></div>
                    <div className="body bearish" style={{ height: '6rem' }}></div>
                    <div className="wick bearish" style={{ height: '8rem' }}></div>
                </div>
            </div>

            {/* Main Login Canvas */}
            <main className="login-canvas">
                <div className="glass-login-card">
                    {/* Branding */}
                    <header className="login-header-section">
                        <div className="logo-container">
                            <span className="material-symbols-outlined logo-icon-svg" style={{ fontVariationSettings: "'FILL' 1" }}>insights</span>
                        </div>
                        <h1 className="brand-name">BullPeak</h1>
                        <p className="brand-tagline">Professional Grade Liquidity</p>
                    </header>

                    {/* Login Form */}
                    <form onSubmit={handleSubmit} className="login-form-fields">
                        {/* Error Handling */}
                        {error && (
                            <div className="login-msg login-error-msg">
                                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>warning</span>
                                {error}
                            </div>
                        )}

                        {/* Email Field (mapped to username) */}
                        <div className="field-group">
                            <label className="field-label" htmlFor="email">Email Address</label>
                            <div className="input-wrapper">
                                <span className="material-symbols-outlined input-icon">mail</span>
                                <input 
                                    className="login-input" 
                                    id="email" 
                                    name="email" 
                                    placeholder="admin@bullpeak.com" 
                                    required 
                                    type="text" 
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        {/* Password Field */}
                        <div className="field-group">
                            <div className="field-label-row">
                                <label className="field-label" htmlFor="password">Password</label>
                                <a className="forgot-password-link" href="#forgot">Forgot Password?</a>
                            </div>
                            <div className="input-wrapper">
                                <span className="material-symbols-outlined input-icon">lock</span>
                                <input 
                                    className="login-input" 
                                    id="password" 
                                    name="password" 
                                    placeholder="••••••••" 
                                    required 
                                    type={showPassword ? "text" : "password"} 
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={isLoading}
                                />
                                <button 
                                    className="password-toggle-btn" 
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    title={showPassword ? "Hide password" : "Show password"}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: '1.125rem' }}>
                                        {showPassword ? 'visibility_off' : 'visibility'}
                                    </span>
                                </button>
                            </div>
                        </div>

                        {/* Action Button */}
                        <button 
                            className="login-submit-button" 
                            type="submit"
                            disabled={isLoading}
                        >
                            <span>{isLoading ? 'Processing...' : 'Sign In'}</span>
                            {!isLoading && <span className="material-symbols-outlined submit-arrow">arrow_forward</span>}
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="login-divider">
                        <div className="divider-line"></div>
                        <div className="divider-text-container">
                            <span className="divider-text">Or continue with</span>
                        </div>
                    </div>

                    {/* Social Logins */}
                    <div className="social-login-grid">
                        <button className="social-button">
                            <img alt="Google" className="social-icon social-icon-mono" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCskafHMFhIpXKMqNrfMjeH30Q0x7kODufO27FVVK9o9xe0jbMlzzG8p4KWGfS-j8EpUd-HgOzZQnSiUVeyB_Q-Wm9c2goJ8xfDZOxuPIXYy5UA9XpFx_vpzMNidG_f8jW22WVz5tcLUoHo_hqpKNrBB_KHYEDHeSRDrcoN-5YqiE-IyznnxRFIeY9ShYGprlRTOY1qYuDVlK-SmTIz3zztRnBBvgpzj7mJcbatq1hYMoQoVCUewhZFt3N706EbMCyWeFlgKysaFIwY"/>
                            <span className="social-button-text">Google</span>
                        </button>
                        <button className="social-button">
                            <span className="material-symbols-outlined github-icon">terminal</span>
                            <span className="social-button-text">GitHub</span>
                        </button>
                    </div>

                    {/* Signup Footer */}
                    <footer className="login-signup-footer">
                        <p className="signup-text">
                            Don't have an account? 
                            <Link className="signup-link" to="/signup">Sign Up</Link>
                        </p>
                    </footer>
                </div>

                {/* Compliance / Legal Links */}
                <div className="legal-links-container">
                    <a className="legal-link" href="#terms">Terms</a>
                    <a className="legal-link" href="#privacy">Privacy</a>
                    <a className="legal-link" href="#security">Security</a>
                </div>
            </main>

            {/* Bottom Nav Bar */}
            <div className="bottom-operational-bar">
                <div className="copyright-text">
                    © 2024 BullPeak. Professional Grade Liquidity.
                </div>
                <div className="network-status-container">
                    <div className="status-indicator">
                        <div className="status-dot"></div>
                        <span className="status-text">Network Operational</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
