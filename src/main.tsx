import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import './estilos.css';
import { ProveedorSesion } from './lib/sesion';
import { ProveedorAvisos } from './ui/ui';
import { registrarSW } from './lib/pwa';

const App = lazy(() => import('./App'));

// Reintentos con espera creciente y datos "frescos" 30 s: miles de usuarios no golpean el servidor a la vez.
const qc = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 10 * 60_000, refetchOnWindowFocus: false, retry: 2, retryDelay: (i) => 800 * 2 ** i + Math.random() * 500 },
    mutations: { retry: 0 },
  },
});
const tema = (() => { try { return localStorage.getItem('usfx-tema'); } catch { return null; } })();
if (tema === 'oscuro') document.documentElement.dataset.tema = 'oscuro';

registrarSW();
createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <HashRouter>
        <ProveedorSesion>
          <ProveedorAvisos>
            <Suspense fallback={null}><App /></Suspense>
          </ProveedorAvisos>
        </ProveedorSesion>
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>,
);
