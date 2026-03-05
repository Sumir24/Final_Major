import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import Terminal from './pages/terminal';
import IndicatorBuilder from './pages/IndicatorBuilder';
import Analytics from './pages/Analytics';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Terminal />} />
          <Route path="/indicator-builder" element={<IndicatorBuilder />} />
          <Route path="/analytics" element={<Analytics />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
