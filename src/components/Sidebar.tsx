// src/components/Sidebar.tsx
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useTeam } from '../context/TeamContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { databases, DATABASE_ID } from '../appwrite';
import { Query } from 'appwrite';
import {
  LayoutDashboard, Users, UserCheck, Package, FileText,
  Bell, Wallet, FileCheck, LogOut, ChevronLeft, ChevronRight,
  Moon, Sun, Menu, X, Building2, Shield, BarChart3, FileOutput,
  FileInput, BookOpen, ArrowRightLeft, Save, CreditCard, Scale,
  BookOpenCheck, BookText, FileDown
} from 'lucide-react';
import { BRAND } from '../config/brand';

interface SidebarProps {
  children: React.ReactNode;
}

interface NavItem {
  path: string;
  label: string;
  icon: any;
  permissions: string[];
  badge?: number;
  color: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export default function Sidebar({ children }: SidebarProps) {
  const { user, logout } = useAuth();
  const { hasPermission } = usePermissions();
  const { customTeamId } = useTeam();
  
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('darkMode') === 'true';
    return false;
  });

  const [pendingRemindersCount, setPendingRemindersCount] = useState(0);
  const [pendingPublicRequestsCount, setPendingPublicRequestsCount] = useState(0);
  const [pendingQuotesActionCount, setPendingQuotesActionCount] = useState(0);
  const [receivedInvoicesCount, setReceivedInvoicesCount] = useState(0);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    if (location.pathname === '/prospects') setPendingPublicRequestsCount(0);
    if (location.pathname === '/quotes') setPendingQuotesActionCount(0);
    if (location.pathname === '/received-invoices') setReceivedInvoicesCount(0);
  }, [location.pathname]);

  useEffect(() => {
    const loadCounts = async () => {
      if (!user || !customTeamId) return;
      try {
        if (hasPermission('invoices.view')) {
          setPendingRemindersCount(0); 
        }
        if (hasPermission('prospects.view')) {
          setPendingPublicRequestsCount(0);
        }
      } catch (e) { /* Erreur silencieuse */ }
    };
    loadCounts();
  }, [user, customTeamId, hasPermission]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Erreur déconnexion:', error);
    } finally {
      window.location.href = '/';
    }
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  const safeUser = user as { name?: string; email?: string; profile?: { firstName?: string } } | null;
  const displayName = safeUser?.profile?.firstName || safeUser?.name || 'Utilisateur';
  const userEmail = safeUser?.email || '';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  
  const isActive = (path: string) => location.pathname === path;
  const hasAnyPermission = (permissions: string[]): boolean => permissions.some(p => p === 'dashboard' || hasPermission(p));

  // ✅ Les modules de comptabilité sont maintenant des éléments normaux.
  // Le blocage visuel et le modal "Premium" sont gérés par ModuleGuard dans App.tsx.
  const navSections: NavSection[] = useMemo(() => [
    {
      title: 'Pilotage',
      items: [
        { path: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard, permissions: ['dashboard'], color: 'text-indigo-600' },
        { path: '/statistics', label: 'Statistiques', icon: BarChart3, permissions: ['reports.view', 'dashboard'], color: 'text-indigo-600' },
      ],
    },
    {
      title: 'Commercial',
      items: [
        { path: '/prospects', label: 'Prospects', icon: Users, permissions: ['prospects.view'], badge: pendingPublicRequestsCount, color: 'text-indigo-600' },
        { path: '/clients', label: 'Clients', icon: UserCheck, permissions: ['clients.view', 'prospects.view'], color: 'text-indigo-600' },
        { path: '/catalogue', label: 'Catalogue', icon: Package, permissions: ['products.view'], color: 'text-indigo-600' },
        { path: '/quotes', label: 'Devis', icon: FileText, permissions: ['quotes.view'], badge: pendingQuotesActionCount, color: 'text-emerald-600' },
      ],
    },
    {
      title: 'Facturation',
      items: [
        { path: '/invoices', label: 'Factures clients', icon: FileOutput, permissions: ['invoices.view'], color: 'text-indigo-600' },
        { path: '/received-invoices', label: 'Factures fournisseurs', icon: FileInput, permissions: ['invoices.view'], badge: receivedInvoicesCount, color: 'text-amber-600' },
        { path: '/reminders', label: 'Relances', icon: Bell, permissions: ['invoices.view'], badge: pendingRemindersCount, color: 'text-orange-600' },
        { path: '/receipts', label: 'Reçus', icon: FileCheck, permissions: ['invoices.view'], color: 'text-teal-600' },
      ],
    },
    {
      title: 'Finance',
      items: [
        { path: '/treasury', label: 'Trésorerie', icon: Wallet, permissions: ['treasury.view', 'invoices.view', 'reports.view', 'dashboard'], color: 'text-indigo-600' },
        { path: '/cash-operations', label: 'Entrées & Sorties', icon: ArrowRightLeft, permissions: ['treasury.view', 'invoices.view', 'dashboard'], color: 'text-emerald-600' },
      ],
    },
    {
      title: 'Comptabilité',
      items: [
        { path: '/journal', label: 'Journal', icon: BookText, permissions: ['reports.view'], color: 'text-indigo-600' },
        { path: '/grand-livre', label: 'Grand Livre', icon: BookOpenCheck, permissions: ['reports.view'], color: 'text-indigo-600' },
        { path: '/balance-comptable', label: 'Balance', icon: Scale, permissions: ['reports.view'], color: 'text-indigo-600' },
        { path: '/export-comptable', label: 'Export Comptable', icon: FileDown, permissions: ['reports.export'], color: 'text-emerald-600' },
      ],
    },
  ], [pendingPublicRequestsCount, pendingQuotesActionCount, receivedInvoicesCount, pendingRemindersCount]);

  const settingsItems: NavItem[] = useMemo(() => [
    { path: '/team-settings', label: 'Équipe & Rôles', icon: Shield, permissions: ['team.view'], color: 'text-indigo-600' },
    { path: '/company-settings', label: 'Mon Entreprise', icon: Building2, permissions: ['settings.view'], color: 'text-slate-600' },
    { path: '/account-mapping', label: 'Plan Comptable', icon: BookOpen, permissions: ['settings.edit', 'settings.view'], color: 'text-indigo-600' },
    { path: '/backup', label: 'Sauvegardes', icon: Save, permissions: ['settings.edit', 'settings.view'], color: 'text-emerald-600' },
    { path: '/audit-log', label: 'Historique & Audit', icon: Shield, permissions: ['settings.view'], color: 'text-indigo-600' },
    { path: '/billing', label: 'Mon Abonnement', icon: CreditCard, permissions: ['settings.view'], color: 'text-amber-600' },
  ], []);

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.path);
    const showBadge = item.badge !== undefined && item.badge > 0;
    const hasAccess = hasAnyPermission(item.permissions);

    return (
      <button
        key={item.path}
        onClick={() => {
          if (hasAccess) handleNavigation(item.path);
        }}
        disabled={!hasAccess}
        title={!hasAccess ? 'Permission insuffisante' : item.label}
        className={`relative w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 group ${
          !hasAccess
            ? 'opacity-40 cursor-not-allowed'
            : active
              ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-medium shadow-sm ring-1 ring-indigo-200/60 dark:ring-indigo-800/50'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
        } ${collapsed ? 'justify-center px-2' : ''}`}
      >
        <div className={`flex-shrink-0 p-1.5 rounded-lg ${active && hasAccess ? 'bg-white dark:bg-slate-900 shadow-sm' : ''}`}>
          <item.icon size={18} className={`transition-transform group-hover:scale-105 ${active && hasAccess ? item.color : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`} />
        </div>
        {!collapsed && (
          <>
            <span className="text-sm flex-1 text-left truncate font-medium">{item.label}</span>
            {showBadge && (
              <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold bg-rose-500 text-white rounded-full shadow-sm">
                {item.badge! > 99 ? '99+' : item.badge}
              </span>
            )}
          </>
        )}
        {collapsed && showBadge && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-[9px] flex items-center justify-center text-white rounded-full border-2 border-white dark:border-slate-800 shadow-sm">
            {item.badge! > 9 ? '9+' : item.badge}
          </span>
        )}
      </button>
    );
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full min-h-0">
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-4 py-5 border-b border-slate-200/60 dark:border-slate-700/60 flex-shrink-0`}>
        {!collapsed ? (
          <Link to="/dashboard" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm transition-transform group-hover:scale-105">
              <Wallet size={16} strokeWidth={2.2} />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-950 dark:text-slate-100">{BRAND.name}</span>
          </Link>
        ) : (
          <Link to="/dashboard" className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm transition-transform hover:scale-105">
            <Wallet size={16} strokeWidth={2.2} />
          </Link>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 transition-all">
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto py-4 px-3 custom-scrollbar overscroll-contain">
        <div className="space-y-6">
          {navSections.map((section, idx) => {
            const filteredItems = section.items.filter(item => hasAnyPermission(item.permissions));
            if (filteredItems.length === 0) return null;
            return (
              <div key={section.title} className="space-y-1">
                {!collapsed && <p className="px-3 pb-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">{section.title}</p>}
                {collapsed && idx > 0 && <div className="my-3 border-t border-slate-200/60 dark:border-slate-700/60" />}
                <div className="space-y-1">{filteredItems.map(renderNavItem)}</div>
              </div>
            );
          })}
        </div>
        <div className="my-6 border-t border-slate-200/60 dark:border-slate-700/60" />
        <div className="space-y-1">
          {!collapsed && <p className="px-3 pb-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">Paramètres</p>}
          {settingsItems.filter(item => hasAnyPermission(item.permissions)).map(renderNavItem)}
        </div>
      </nav>

      <div className="border-t border-slate-200/60 dark:border-slate-700/60 p-3 space-y-2 flex-shrink-0 bg-slate-50/50 dark:bg-slate-800/50">
        <button onClick={() => setDarkMode(!darkMode)} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm transition-all ${collapsed ? 'justify-center' : ''}`}>
          <div className="flex-shrink-0 p-1.5 rounded-lg bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200/60 dark:ring-slate-700/60">
            {darkMode ? <Sun size={16} className="text-amber-500" /> : <Moon size={16} className="text-indigo-600" />}
          </div>
          {!collapsed && <span className="text-sm font-medium">{darkMode ? 'Mode clair' : 'Mode sombre'}</span>}
        </button>
        <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 ring-1 ring-slate-200/60 dark:ring-slate-700/60 shadow-sm ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm ring-2 ring-white dark:ring-slate-700">{initials}</div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{displayName}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{userEmail}</p>
            </div>
          )}
          {!collapsed && (
            <button onClick={handleLogout} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-slate-400 hover:text-rose-600 transition-all" title="Déconnexion">
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen min-h-0 bg-[#fafaf6] dark:bg-slate-900 overflow-hidden font-sans">
      <aside className={`hidden lg:flex flex-col min-h-0 bg-white dark:bg-slate-800 border-r border-slate-200/60 dark:border-slate-700/60 transition-all duration-300 ease-in-out ${collapsed ? 'w-20' : 'w-64'}`}>
        {renderSidebarContent()}
      </aside>

      {mobileOpen && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-slate-800 border-r border-slate-200/60 dark:border-slate-700/60 transform transition-transform duration-300 ease-out lg:hidden flex flex-col shadow-2xl ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 py-5 border-b border-slate-200/60 dark:border-slate-700/60 flex-shrink-0 bg-slate-50/50 dark:bg-slate-800/50">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm"><Wallet size={16} strokeWidth={2.2} /></div>
            <span className="text-lg font-bold tracking-tight text-slate-950 dark:text-slate-100">{BRAND.name}</span>
          </Link>
          <button onClick={() => setMobileOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-all"><X size={20} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">{renderSidebarContent()}</div>
      </aside>

      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        <header className="lg:hidden bg-white dark:bg-slate-800 border-b border-slate-200/60 dark:border-slate-700/60 px-4 py-3 flex items-center justify-between flex-shrink-0 shadow-sm">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 transition-all"><Menu size={22} /></button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white"><Wallet size={14} strokeWidth={2.2} /></div>
            <span className="text-base font-bold tracking-tight text-slate-950 dark:text-slate-100">{BRAND.name}</span>
          </div>
          <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm ring-2 ring-white dark:ring-slate-700">{initials}</div>
        </header>

        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-contain bg-[#fafaf6] dark:bg-slate-900">
          {children}
        </main>
      </div>
    </div>
  );
}