import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import Terminal from './pages/terminal';
import IndicatorBuilder from './pages/IndicatorBuilder';
import Analytics from './pages/Analytics';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './component/PrivateRoute';

import Login from './pages/Login';
import Signup from './pages/Signup';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            {/* Main Application Routes - Protected */}
            <Route path="/" element={
              <PrivateRoute>
                <Terminal />
              </PrivateRoute>
            } />
            <Route path="/indicator-builder" element={
              <PrivateRoute>
                <IndicatorBuilder />
              </PrivateRoute>
            } />
            <Route path="/analytics" element={
              <PrivateRoute>
                <Analytics />
              </PrivateRoute>
            } />

            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
