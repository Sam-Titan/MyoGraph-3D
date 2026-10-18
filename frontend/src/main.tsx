import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import { loadSnapshot } from '@/api/snapshot'
import { initAnalytics } from '@/lib/analytics'
import { retryWhileWaking, wakeDelayMs } from '@/lib/wake'
import '@/index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: retryWhileWaking(3), retryDelay: wakeDelayMs } },
})
const root = document.getElementById('root')
if (!root) throw new Error('missing #root element')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)

// Not awaited: the first screen renders now and the snapshot fills the cache when it arrives.
void loadSnapshot(queryClient)
initAnalytics()
