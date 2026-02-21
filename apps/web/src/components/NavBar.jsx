import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Map' },
  { to: '/routes', label: 'Routes' },
  { to: '/favorites', label: 'Favorites' },
  { to: '/terms', label: 'Terms' }
];

export const NavBar = () => (
  <nav className="nav-bar">
    {links.map((link) => (
      <NavLink key={link.to} to={link.to} end={link.to === '/'} className="nav-link">
        {link.label}
      </NavLink>
    ))}
  </nav>
);
