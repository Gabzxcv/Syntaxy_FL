import React from 'react';

/**
 * Logo Component
 * 
 * To customize the logo:
 * 1. Place your logo image in /frontend/public/ (e.g., /frontend/public/logo.png)
 * 2. Update the `logoPath` constant below with your logo filename
 * 3. Adjust the styling in the logo-container className if needed
 * 
 * Example: const logoPath = '/logo.png';
 */

const Logo = ({ className = '', style = {} }) => {
  const logoPath = '/logo.png';
  const logoAlt = 'Syntaxy Logo';
  
  const useTextLogo = false;
  const textLogo = 'Syntaxy';

  return (
    <div className={`logo-container ${className}`} style={{ display: 'flex', justifyContent: 'center', padding: '8px 0', background: 'transparent', border: 'none', ...style }}>
      {useTextLogo ? (
        <h1 className="sidebar-logo">{textLogo}</h1>
      ) : (
        <img 
          src={logoPath} 
          alt={logoAlt} 
          className="logo-image"
          style={{ width: '200px', maxWidth: '100%', height: 'auto', display: 'block', filter: 'drop-shadow(0 2px 8px rgba(51, 65, 149, 0.4))' }}
        />
      )}
    </div>
  );
};

export default Logo;
