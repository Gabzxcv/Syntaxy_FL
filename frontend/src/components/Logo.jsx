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
  // CUSTOMIZE YOUR LOGO PATH HERE:
  const logoPath = '/logo.png'; // Replace with your logo path, e.g., '/logo.png'
  const logoAlt = 'Syntaxy Logo';
  
  // Optional: Use text logo instead of image by setting useTextLogo to true
  const useTextLogo = false;
  const textLogo = 'Dashboard';

  return (
    <div className={`logo-container ${className}`} style={style}>
      {useTextLogo ? (
        <h1 className="sidebar-logo">{textLogo}</h1>
      ) : (
        <img 
          src={logoPath} 
          alt={logoAlt} 
          className="logo-image"
          style={{ maxWidth: '160px', height: 'auto' }}
        />
      )}
    </div>
  );
};

export default Logo;
