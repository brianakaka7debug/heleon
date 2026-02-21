import { NavLink } from 'react-router-dom';

const links = [
  { to: '/nearby', label: 'Nearby', icon: 'nearby', accent: '#5B6ABF', accentSoft: '#E9EDFF' },
  { to: '/search', label: 'Search', icon: 'search', accent: '#2B9AAF', accentSoft: '#E6F7FB' },
  { to: '/favorites', label: 'Favorites', icon: 'favorites', accent: '#E8913A', accentSoft: '#FFF4E7' },
  { to: '/service', label: 'Service', icon: 'service', accent: '#2F855A', accentSoft: '#EAF8EF' }
];

const BottomNavIcon = ({ kind }) => {
  if (kind === 'nearby') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M12 21s6-5.9 6-11a6 6 0 1 0-12 0c0 5.1 6 11 6 11Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="10" r="2.4" fill="currentColor" />
      </svg>
    );
  }

  if (kind === 'favorites') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1L3.2 9.4l6.1-.9L12 3Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (kind === 'service') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="4" y="4.5" width="16" height="12" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="8.2" cy="17.8" r="1.5" fill="currentColor" />
        <circle cx="15.8" cy="17.8" r="1.5" fill="currentColor" />
        <path d="M7 9h10M7 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="6.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16.2 16.2 21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
};

export const BottomNav = () => (
  <nav className="bottom-nav" aria-label="Primary navigation">
    {links.map((link) => (
      <NavLink
        key={link.to}
        to={link.to}
        className={({ isActive }) => `bottom-nav-link${isActive ? ' active' : ''}`}
        style={{
          '--tab-accent': link.accent,
          '--tab-accent-soft': link.accentSoft
        }}
      >
        <span className="bottom-nav-icon">
          <BottomNavIcon kind={link.icon} />
        </span>
        <span className="bottom-nav-label">{link.label}</span>
      </NavLink>
    ))}
  </nav>
);
