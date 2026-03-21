import React from 'react';
import ReactDOM from 'react-dom/client';
import '../global.css';
import './dashboard.css';
import DashboardApp from './DashboardApp';

ReactDOM.createRoot(document.getElementById('dashboard-root')).render(
  <React.StrictMode>
    <DashboardApp />
  </React.StrictMode>
);
