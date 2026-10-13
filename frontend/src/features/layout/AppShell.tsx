import { Toaster } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AboutPanel } from '@/features/about/AboutPanel'
import { DisclaimerBanner } from '@/features/layout/DisclaimerBanner'
import { ErrorBoundary } from '@/features/layout/ErrorBoundary'
import { HealthStatus } from '@/features/layout/HealthStatus'
import { useInitSelectedTarget } from '@/features/layout/useInitSelectedTarget'
import { WorkspaceLayout } from '@/features/patient/WorkspaceLayout'
import { PerformancePanel } from '@/features/performance/PerformancePanel'
import { type Tab, useAppStore } from '@/store/app'

const TABS: { id: Tab; label: string }[] = [
  { id: 'workspace', label: 'Patient Workspace' },
  { id: 'performance', label: 'Model Performance' },
  { id: 'about', label: 'About & Method' },
]

// Inactive panels use keepMounted and stay in the DOM, hidden via the `hidden` attribute. Phase 7
// relies on this: the R3F canvas must keep its state and resize when the workspace is shown again.
const PANEL = 'min-h-0 flex-1 [&[hidden]]:hidden'

export function AppShell() {
  useInitSelectedTarget()
  const tab = useAppStore((s) => s.tab)
  const setTab = useAppStore((s) => s.setTab)

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as Tab)}
      className="h-dvh gap-0 bg-background text-foreground"
    >
      {/* Banner + header never scroll away: the disclaimer is visible on every tab. */}
      <div className="sticky top-0 z-50 shrink-0">
        <DisclaimerBanner />
        <header className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b bg-card px-(--gutter) py-2">
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-semibold tracking-tight">CardioLens</h1>
            <span className="num text-xs text-muted-foreground">3D</span>
          </div>
          <TabsList variant="line" aria-label="Sections">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="px-3">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="ml-auto min-w-0 max-w-full">
            <HealthStatus />
          </div>
        </header>
      </div>

      <ErrorBoundary>
        <TabsContent value="workspace" keepMounted className={PANEL}>
          <WorkspaceLayout />
        </TabsContent>
        <TabsContent value="performance" keepMounted className={`${PANEL} overflow-y-auto`}>
          <PerformancePanel />
        </TabsContent>
        <TabsContent value="about" keepMounted className={`${PANEL} overflow-y-auto`}>
          <AboutPanel />
        </TabsContent>
      </ErrorBoundary>
      <Toaster position="bottom-right" />
    </Tabs>
  )
}
