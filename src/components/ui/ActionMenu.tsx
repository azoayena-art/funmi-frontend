import { useState, useRef, useEffect, ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';

export interface ActionMenuItemProps {
  onClick: (e?: React.MouseEvent) => void;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  danger?: boolean;
  disabled?: boolean;
}

export const ActionMenuItem = ({
  onClick,
  icon: Icon,
  label,
  danger = false,
  disabled = false,
}: ActionMenuItemProps) => {
  return (
    <button
      role="menuitem"
      onClick={(e) => {
        e?.stopPropagation();
        onClick(e);
      }}
      disabled={disabled}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-left 
        transition-all duration-150 rounded-md mx-1 my-0.5
        ${disabled 
          ? 'opacity-50 cursor-not-allowed text-slate-400 dark:text-slate-500' 
          : danger 
            ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300' 
            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white'
        }
        focus:outline-none focus:ring-2 focus:ring-purple-500/20
      `}
    >
      {Icon && <Icon size={16} className="flex-shrink-0" />}
      <span className="truncate flex-1">{label}</span>
    </button>
  );
};

export const ActionMenu = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Fermeture avec la touche Échap (Accessibilité Premium)
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      {/* Bouton Trigger */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="
          p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 
          dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/50 
          transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20
        "
        aria-label="Ouvrir le menu d'actions"
      >
        <MoreHorizontal size={18} className="transition-transform duration-200" />
      </button>

      {/* Menu Déroulant */}
      {isOpen && (
        <div 
          role="menu"
          className="
            absolute right-0 mt-2 w-56 
            bg-white dark:bg-slate-800 
            rounded-xl shadow-xl border border-slate-200/80 dark:border-slate-700/80 
            ring-1 ring-black/5 dark:ring-white/10 
            py-1.5 z-50 
            animate-in fade-in zoom-in-95 duration-200
          "
        >
          {children}
        </div>
      )}
    </div>
  );
};

export default ActionMenu;