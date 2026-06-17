// frontend/src/store/useAuthStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// In-memory refresh guard — prevents parallel refresh calls
let _refreshInFlight = null;

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isGuest: !localStorage.getItem('pivotradar_auth'),
      isAuthResolved: false,
      _sessionId: 0,

      setAuth: (user, token, refreshToken) => {
        set({
          user,
          token,
          refreshToken: refreshToken || get().refreshToken,
          isAuthenticated: !!token,
          isGuest: false,
          isAuthResolved: true,
          _sessionId: 0,
        });
      },

      logout: () => {
        // Invalidate any in-flight refresh
        _refreshInFlight = null;
        // Increment session ID to invalidate any in-flight requests
        const nextSessionId = (get()._sessionId || 0) + 1;

        // 1. Clear state immediately
        set({ 
          user: null, 
          token: null, 
          refreshToken: null, 
          isAuthenticated: false, 
          isGuest: true, 
          isAuthResolved: true,
          _sessionId: nextSessionId
        });

        // 2. Clear sensitive storage (Targeted - Do NOT clear pr_guest)
        localStorage.removeItem('pivotradar_auth');
        localStorage.removeItem('pr_portfolio_v1');
        localStorage.removeItem('pr_dismissed_notifs');
        
        // 3. Reset dependent stores
        import('@/core/store/useScanStore').then((module) => {
          if (module.useScanStore) module.useScanStore.getState().resetStore();
        }).catch(() => {});
      },

      // Helper to call backend /refresh — deduplicated: parallel callers share one request
      performRefresh: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return null;

        if (_refreshInFlight) return _refreshInFlight;

        _refreshInFlight = (async () => {
          try {
            // Backend expects JSON body { refresh_token: "..." }, NOT query param
            const res = await fetch('/api/auth/refresh', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token: refreshToken }),
            });
            if (res.ok) {
              const data = await res.json();
              set({
                token: data.access_token,
                refreshToken: data.refresh_token,
                isAuthenticated: true
              });
              return data.access_token;
            }
            // Only logout on explicit 401/403 — 5xx means server is restarting
            if (res.status === 401 || res.status === 403) {
              get().logout();
            }
          } catch (err) {
            console.error("Token refresh failed:", err);
            // Network error / server down — don't logout
          } finally {
            _refreshInFlight = null;
          }
          return null;
        })();

        return _refreshInFlight;
      },

      fetchUser: async () => {
        const { token, _sessionId: currentSessionId } = get();
        if (!token) {
           set({ isAuthResolved: true });
           return;
        }

        const callProfile = async (tk) => {
          return fetch('/api/users/me', {
            headers: { 'Authorization': `Bearer ${tk}` }
          });
        };

        try {
          let response = await callProfile(token);
          let refreshedToken = null;

          if (response.status === 401) {
            // Try refresh
            refreshedToken = await get().performRefresh();
            if (refreshedToken) {
              response = await callProfile(refreshedToken);
            }
            // If refresh itself failed (null), keep response as-is but DO NOT logout —
            // server may be restarting; user will be re-verified on next interval
          }

          if (response.ok) {
            const userData = await response.json();
            // Race condition guard: only update if still authenticated and on same session
            if (get().isAuthenticated && get()._sessionId === currentSessionId) {
              set({ user: userData });
            }
          } else if (response.status === 401 && refreshedToken) {
            // Got a fresh token but it was also rejected → genuine auth failure → logout
            if (get()._sessionId === currentSessionId) {
              get().logout();
            }
          }
          // 401 with no refreshedToken: refresh failed (server issue) → keep auth, retry later
          // 5xx / 502 / 503: server-side or transient error → keep auth state intact
        } catch (error) {
          console.error("Fetch user failed:", error);
        } finally {
          set({ isAuthResolved: true });
        }
      }
    }),
    {
      name: 'pivotradar_auth',
    }
  )
);

export default useAuthStore;
