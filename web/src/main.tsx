import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { RealtimeProvider } from '@/providers/RealtimeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { App } from './App';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // One retry is enough; a second rarely helps and doubles the wait.
      retry: (failureCount, error) => {
        if (error instanceof ApiError) {
          // Never retry these: they will fail identically.
          if (error.isUnauthorized || error.isForbidden || error.isNotFound) return false;
          if (error.isValidation || error.isRateLimited) return false;
        }
        return failureCount < 1;
      },
      staleTime: 20_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root was not found.');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <RealtimeProvider>
                <App />
              </RealtimeProvider>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
