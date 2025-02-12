'use client';

import { useState } from 'react';

export default function LanguageSwitcher() {
  const [locale, setLocale] = useState('en'); // Default locale

  const changeLocale = (newLocale) => {
    // Set the locale in a cookie
    document.cookie = `locale=${newLocale}; path=/; max-age=31536000`; // 1 year

    // Update the state (to reflect the change on the page if needed)
    setLocale(newLocale);

    // Reload the page to apply the new language (or you could just trigger a state change if using something like context)
    window.location.reload();
  };

  return (
    <div className="flex space-x-4 justify-center items-center">
      {/* English Button */}
      <button onClick={() => changeLocale('en')} className="p-2">
        <img 
          src="https://flagcdn.com/w320/gb.png" 
          alt="English" 
          className="w-8 h-5 object-cover" 
        />
      </button>

      {/* Finnish Button */}
      <button onClick={() => changeLocale('fi')} className="p-2">
        <img 
          src="https://flagcdn.com/w320/fi.png" 
          alt="Finnish" 
          className="w-8 h-5 object-cover" 
        />
      </button>
    </div>
  );
}
