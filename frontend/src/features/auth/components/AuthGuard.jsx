import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '@/store/useAuthStore';
import { useScanStore } from '@/core/store/useScanStore';

const AuthGuard = ({ children }) => {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const fetchUser = useAuthStore(state => state.fetchUser);
  const initFromUser = useScanStore(state => state.initFromUser);
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      // Ensure isGuest is false if authenticated (Safety sync)
      if (useAuthStore.getState().isGuest) {
        useAuthStore.setState({ isGuest: false });
      }

      // If user is already in store, sync it immediately
      const currentUser = useAuthStore.getState().user;
      if (currentUser) initFromUser(currentUser);

      // Then fetch latest from server for eventual consistency
      fetchUser().then(() => {
        const latestUser = useAuthStore.getState().user;
        if (latestUser) initFromUser(latestUser);
      });
    } else {
      // Ensure isGuest is true if not authenticated
      if (!useAuthStore.getState().isGuest) {
        useAuthStore.setState({ isGuest: true });
      }
      useAuthStore.setState({ isAuthResolved: true });
    }
  }, [isAuthenticated, fetchUser, initFromUser]);

  // Allow guests to access the main terminal and specific ticker analyses
  const isGuestAccessible = location.pathname.startsWith('/terminal') ||
                            ['/portfolio', '/logs', '/backtest', '/market', '/news', '/tools'].includes(location.pathname);

  if (!isAuthenticated && !isGuestAccessible) {
    return <Navigate to="/" replace />;
  }

  // Check legal acceptance
  const localAccepted = localStorage.getItem('pivot_legal_accepted') === 'true';
  const user = useAuthStore.getState().user;
  const hasAccepted = user?.settings?.has_accepted_legal || localAccepted;

  // For authenticated users, we still return null if not accepted (they MUST see the modal).
  // For guests, we let it pass because they are "temporary" and we'll show the modal globally.
  if (isAuthenticated && !hasAccepted) {
    return null;
  }

  return children;
};

export default AuthGuard;
