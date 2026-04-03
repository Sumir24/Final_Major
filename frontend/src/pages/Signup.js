import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css'; // Reusing Login.css for consistent styling

const Signup = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const { register } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        document.documentElement.classList.add('dark');
        return () => document.documentElement.classList.remove('dark');
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setIsLoading(true);

        try {
            await register(email, password);
            // After successful registration, redirect to login
            navigate('/login', { state: { message: 'Registration successful! Please log in.' } });
        } catch (err) {
            setError(err.message || 'Registration failed. Please try again.');
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
            </div>

            {/* Main Signup Canvas */}
            <main className="login-canvas">
                <div className="glass-login-card">
                    {/* Branding */}
                    <header className="login-header-section">
                        <div className="logo-container">
                            <span className="material-symbols-outlined logo-icon-svg" style={{ fontVariationSettings: "'FILL' 1" }}>insights</span>
                        </div>
                        <h1 className="brand-name">BullPeak</h1>
                        <p className="brand-tagline">Create your institutional account</p>
                    </header>

                    {/* Signup Form */}
                    <form onSubmit={handleSubmit} className="login-form-fields">
                        {/* Error Handling */}
                        {error && (
                            <div className="login-msg login-error-msg">
                                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>warning</span>
                                {error}
                            </div>
                        )}

                        {/* Email Field */}
                        <div className="field-group">
                            <label className="field-label" htmlFor="email">Email Address</label>
                            <div className="input-wrapper">
                                <span className="material-symbols-outlined input-icon">mail</span>
                                <input 
                                    className="login-input" 
                                    id="email" 
                                    name="email" 
                                    placeholder="your@email.com" 
                                    required 
                                    type="email" 
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        {/* Password Field */}
                        <div className="field-group">
                            <label className="field-label" htmlFor="password">Password</label>
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
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: '1.125rem' }}>
                                        {showPassword ? 'visibility_off' : 'visibility'}
                                    </span>
                                </button>
                            </div>
                        </div>

                        {/* Confirm Password Field */}
                        <div className="field-group">
                            <label className="field-label" htmlFor="confirmPassword">Confirm Password</label>
                            <div className="input-wrapper">
                                <span className="material-symbols-outlined input-icon">lock_reset</span>
                                <input 
                                    className="login-input" 
                                    id="confirmPassword" 
                                    name="confirmPassword" 
                                    placeholder="••••••••" 
                                    required 
                                    type={showPassword ? "text" : "password"} 
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        {/* Action Button */}
                        <button 
                            className="login-submit-button" 
                            type="submit"
                            disabled={isLoading}
                        >
                            <span>{isLoading ? 'Creating Account...' : 'Get Started'}</span>
                            {!isLoading && <span className="material-symbols-outlined submit-arrow">person_add</span>}
                        </button>
                    </form>

                    {/* Signup Footer */}
                    <footer className="login-signup-footer">
                        <p className="signup-text">
                            Already have an account? 
                            <Link className="signup-link" to="/login">Sign In</Link>
                        </p>
                    </footer>
                </div>
            </main>

            {/* Bottom Nav Bar */}
            <div className="bottom-operational-bar">
                <div className="copyright-text">
                    © 2024 BullPeak. Professional Grade Liquidity.
                </div>
            </div>
        </div>
    );
};

export default Signup;
