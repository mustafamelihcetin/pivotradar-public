import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { HelmetProvider } from 'react-helmet-async'
// Material Symbols: self-hosted via /public (preloaded in index.html for early load)
// Text fonts: self-hosted via @fontsource
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/700.css'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './shared/components/ErrorBoundary'

// Sentry: opt-in via VITE_SENTRY_DSN env var
const _sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (_sentryDsn) {
  import('@sentry/react').then(Sentry => {
    Sentry.init({
      dsn: _sentryDsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
    });
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// GoogleOAuthProvider requires a valid clientId — skip if not configured
const AppWithProviders = (
  <StrictMode>
    <ErrorBoundary>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  </StrictMode>
);

// Block native browser context menu unconditionally (crash-proof, runs before React)
document.addEventListener('contextmenu', (e) => e.preventDefault());

createRoot(document.getElementById('root')).render(AppWithProviders)

// cache buster: 1779741924,88102
