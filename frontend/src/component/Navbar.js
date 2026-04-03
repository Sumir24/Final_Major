import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

const Navbar = () => {
    const { logout, user } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <nav className="main-navbar">
            <div className="nav-brand">
                <span className="material-symbols-outlined nav-logo-icon">insights</span>
                <span className="brand-text">BullPeak</span>
            </div>
            
            <div className="nav-links">
                <NavLink to="/" end className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                    <span className="material-symbols-outlined">terminal</span>
                    <span>Terminal</span>
                </NavLink>
                <NavLink to="/indicator-builder" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                    <span className="material-symbols-outlined">query_stats</span>
                    <span>Build</span>
                </NavLink>
                <NavLink to="/analytics" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                    <span className="material-symbols-outlined">analytics</span>
                    <span>Analytics</span>
                </NavLink>
            </div>

            <div className="nav-user-actions">
                <div className="user-profile">
                    <div className="user-avatar">
                        {user?.username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <span className="username-display">{user?.username || 'User'}</span>
                </div>
                <button className="logout-btn" onClick={handleLogout} title="Sign Out">
                    <span className="material-symbols-outlined">logout</span>
                </button>
            </div>
        </nav>
    );
};

export default Navbar;
