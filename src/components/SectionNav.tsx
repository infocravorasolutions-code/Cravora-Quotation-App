import { Link, useLocation } from 'react-router-dom';

export default function SectionNav({ links }: { links: Array<{ path: string; label: string }> }) {
  const location = useLocation();
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {links.map((link) => {
        const active = link.path === '/'
          ? location.pathname === '/'
          : location.pathname === link.path || location.pathname.startsWith(`${link.path}/`);
        return (
          <Link
            key={link.path}
            to={link.path}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              active ? 'bg-cravora-purple text-white' : 'bg-white text-gray-700 shadow'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
