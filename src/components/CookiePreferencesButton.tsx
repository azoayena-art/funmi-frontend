// src/components/CookiePreferencesButton.tsx
import { useState } from 'react';
import { Cookie } from 'lucide-react';

export default function CookiePreferencesButton() {
  const [, setTrigger] = useState(0);

  const handleClick = () => {
    // Supprime le consentement pour réafficher le bandeau
    localStorage.removeItem('relancepro_cookie_consent');
    // Force le rechargement pour réafficher le bandeau
    window.location.reload();
  };

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
    >
      <Cookie size={12} />
      Gérer mes cookies
    </button>
  );
}