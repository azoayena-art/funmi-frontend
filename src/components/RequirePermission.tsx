
import { Navigate, useLocation } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions';
import { Loader2 } from 'lucide-react';

interface RequirePermissionProps {
  children: React.ReactNode;
  requiredPermission: string;
  fallbackPath?: string;
}

export default function RequirePermission({
  children,
  requiredPermission,
  fallbackPath = '/dashboard'
}: RequirePermissionProps) {
  const {
    hasPermission,
    loading,
    permissions,
    userRole
  } = usePermissions();

  const location = useLocation();

  const accessGranted = hasPermission(requiredPermission);

  console.log('🔎 DIAGNOSTIC REQUIRE PERMISSION', {
    path: location.pathname,
    requiredPermission,
    loading,
    userRole,
    accessGranted,
    accountingAccess: hasPermission('accounting.advanced'),
    permissions
  });

  if (loading) {
    console.log('⏳ Permissions en cours de chargement:', location.pathname);

    return (
      <div className="flex flex-col items-center justify-center h-[80vh] gap-3">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
        <p className="text-sm text-slate-500">
          Vérification des accès...
        </p>
      </div>
    );
  }

  if (!accessGranted) {
    console.warn('⛔ ACCÈS REFUSÉ - REDIRECTION', {
      path: location.pathname,
      requiredPermission,
      userRole,
      permissions
    });

    return (
      <Navigate
        to={fallbackPath}
        state={{ from: location }}
        replace
      />
    );
  }

  console.log('✅ ACCÈS AUTORISÉ:', location.pathname);

  return <>{children}</>;
}
