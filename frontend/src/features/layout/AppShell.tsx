import { BarChart3, HeartPulse, Info, type LucideIcon, Scale } from 'lucide-react'
import { lazy, Suspense, useEffect } from 'react'
import { Toaster } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DisclaimerBanner } from '@/features/layout/DisclaimerBanner'
import { ErrorBoundary } from '@/features/layout/ErrorBoundary'
import { HealthStatus } from '@/features/layout/HealthStatus'
import { useInitSelectedTarget } from '@/features/layout/useInitSelectedTarget'
import { WorkspaceLayout } from '@/features/patient/WorkspaceLayout'
import { StoryLauncher } from '@/features/story/StoryLauncher'
import { StoryPrompt } from '@/features/story/StoryPrompt'
import { track } from '@/lib/analytics'
import { type Tab, useAppStore } from '@/store/app'

// The non-workspace tabs (and Recharts) load on first visit, not with the first paint.
const AboutPanel = lazy(() =>
  import('@/features/about/AboutPanel').then((m) => ({ default: m.AboutPanel })),
)
const BenchmarkPanel = lazy(() =>
  import('@/features/benchmark/BenchmarkPanel').then((m) => ({ default: m.BenchmarkPanel })),
)
const PerformancePanel = lazy(() =>
  import('@/features/performance/PerformancePanel').then((m) => ({ default: m.PerformancePanel })),
)

function PanelSkeleton() {
  return (
    <div role="status" aria-busy className="space-y-3 p-(--gutter)">
      <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
      <div className="h-40 animate-pulse rounded-lg bg-muted" />
      <div className="h-40 animate-pulse rounded-lg bg-muted" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}

const TABS: { id: Tab; label: string; short: string; icon: LucideIcon }[] = [
  { id: 'workspace', label: 'Patient workspace', short: 'Patient', icon: HeartPulse },
  { id: 'performance', label: 'Model performance', short: 'Model', icon: BarChart3 },
  { id: 'benchmark', label: 'Benchmark', short: 'Benchmark', icon: Scale },
  { id: 'about', label: 'About and method', short: 'About', icon: Info },
]

// Inactive panels use keepMounted and stay in the DOM, hidden via the `hidden` attribute. Phase 7
// relies on this: the R3F canvas must keep its state and resize when the workspace is shown again.
const PANEL = 'min-h-0 flex-1 [&[hidden]]:hidden'

export function AppShell() {
  useInitSelectedTarget()
  const tab = useAppStore((s) => s.tab)
  const setTab = useAppStore((s) => s.setTab)
  useEffect(() => {
    const label = TABS.find((t) => t.id === tab)?.label
    document.title = label ? `${label} · MyoGraph 3D` : 'MyoGraph 3D'
  }, [tab])

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => {
        setTab(v as Tab)
        track('tab_viewed', { tab: v })
      }}
      className="h-dvh gap-0 bg-background print:hidden text-foreground max-lg:pb-[calc(3.5rem+env(safe-area-inset-bottom))]"
    >
      {/* Banner + header never scroll away: the disclaimer is visible on every tab. */}
      <div className="sticky top-0 z-50 shrink-0">
        <DisclaimerBanner />
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b sm:gap-x-8 bg-background px-(--gutter) py-2">
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-semibold tracking-tight">MyoGraph</h1>
            <span className="text-xs text-muted-foreground">3D</span>
          </div>
          {/* Top tabs from lg; below that the same list is a bottom navigation bar (thumb reach). */}
          <TabsList
            variant="line"
            aria-label="Sections"
            className="max-w-full min-w-0 justify-start overflow-x-auto max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-50 max-lg:grid max-lg:h-[calc(3.5rem+env(safe-area-inset-bottom))] max-lg:w-full max-lg:max-w-none max-lg:grid-cols-4 max-lg:gap-0 max-lg:rounded-none max-lg:border-t max-lg:bg-background max-lg:p-0 max-lg:pb-[env(safe-area-inset-bottom)]"
          >
            {TABS.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                aria-label={t.label}
                className="shrink-0 px-3 max-lg:h-14 max-lg:flex-col max-lg:gap-0.5 max-lg:rounded-none max-lg:px-1 max-lg:text-[0.6875rem] max-lg:after:inset-x-3 max-lg:after:top-0 max-lg:after:bottom-auto"
              >
                <t.icon aria-hidden className="size-5 lg:hidden" />
                <span className="lg:hidden">{t.short}</span>
                <span className="max-lg:hidden">{t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="ml-auto flex min-w-0 max-w-full items-center gap-3">
            <StoryLauncher />
            <HealthStatus />
          </div>
        </header>
      </div>

      <main className="flex min-h-0 flex-1 flex-col">
        <ErrorBoundary>
          <TabsContent value="workspace" keepMounted className={PANEL}>
            <WorkspaceLayout />
          </TabsContent>
          <TabsContent value="performance" keepMounted className={`${PANEL} overflow-y-auto`}>
            {/* Charts measure their container: mounting them while the tab is hidden gives 0x0 (Recharts warns). */}
            {tab === 'performance' && (
              <Suspense fallback={<PanelSkeleton />}>
                <PerformancePanel />
              </Suspense>
            )}
          </TabsContent>
          <TabsContent value="benchmark" keepMounted className={`${PANEL} overflow-y-auto`}>
            {tab === 'benchmark' && (
              <Suspense fallback={<PanelSkeleton />}>
                <BenchmarkPanel />
              </Suspense>
            )}
          </TabsContent>
          <TabsContent value="about" keepMounted className={`${PANEL} overflow-y-auto`}>
            {tab === 'about' && (
              <Suspense fallback={<PanelSkeleton />}>
                <AboutPanel />
              </Suspense>
            )}
          </TabsContent>
        </ErrorBoundary>
      </main>
      <StoryPrompt />
      <Toaster position="bottom-right" mobileOffset={{ bottom: '4.5rem' }} />
    </Tabs>
  )
}
