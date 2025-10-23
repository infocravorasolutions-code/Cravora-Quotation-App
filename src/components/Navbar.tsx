import { Link, useLocation } from 'react-router-dom';
import { CheckCircle, Users, Package, FileCheck, History } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Navbar() {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Client', icon: Users },
    { path: '/modules', label: 'Modules', icon: Package },
    { path: '/summary', label: 'Summary', icon: FileCheck },
    { path: '/history', label: 'History', icon: History },
  ];

  return (
    <nav className="bg-white shadow-md">
      <div className="container mx-auto px-2 sm:px-6">
        <div className="flex items-center justify-between h-12 sm:h-16">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 sm:w-8 sm:h-8 bg-cravora-purple rounded-full flex items-center justify-center">
              <CheckCircle className="w-3 h-3 sm:w-5 sm:h-5 text-white" />
            </div>
            <span className="text-lg sm:text-xl font-bold text-cravora-purple">CRAVORA</span>
          </div>

          {/* Desktop Navigation - Hidden on mobile */}
          <div className="hidden sm:flex space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <Link key={item.path} to={item.path}>
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-cravora-purple text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="font-medium">{item.label}</span>
                  </motion.div>
                </Link>
              );
            })}
          </div>

          {/* Mobile - Show current page indicator only */}
          <div className="sm:hidden">
            <div className="text-sm font-medium text-cravora-purple">
              {navItems.find(item => item.path === location.pathname)?.label || 'Client'}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
