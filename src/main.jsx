import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Admin from './components/Admin.jsx';
import './styles.css';

// The admin screen lives at #/admin. The public page's #titles / #request / #schedule links don't match it.
const isAdminHash = () => window.location.hash === '#/admin';

function Root() {
  const [admin, setAdmin] = useState(isAdminHash);
  useEffect(() => {
    const onChange = () => setAdmin(isAdminHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return admin ? <Admin /> : <App />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
