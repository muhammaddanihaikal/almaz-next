export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header Skeleton */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded-lg bg-neutral-200" />
          <div className="h-4 w-64 rounded-md bg-neutral-100" />
        </div>
        <div className="h-10 w-32 rounded-lg bg-neutral-200" />
      </div>

      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 rounded bg-neutral-100" />
              <div className="h-8 w-8 rounded-md bg-neutral-100" />
            </div>
            <div className="mt-3 h-7 w-32 rounded-lg bg-neutral-200" />
          </div>
        ))}
      </div>

      {/* Main Content Card Skeleton */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="mb-6 flex items-center justify-between">
          <div className="h-4 w-40 rounded bg-neutral-200" />
          <div className="h-6 w-20 rounded bg-neutral-100" />
        </div>
        <div className="space-y-4">
          <div className="h-[200px] w-full rounded-lg bg-neutral-50" />
          <div className="flex gap-4">
            <div className="h-4 w-1/3 rounded bg-neutral-100" />
            <div className="h-4 w-1/4 rounded bg-neutral-100" />
            <div className="h-4 w-1/5 rounded bg-neutral-100" />
          </div>
        </div>
      </div>

      {/* Table/List Skeleton */}
      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="border-b border-neutral-100 bg-neutral-50/50 px-5 py-3">
          <div className="h-4 w-32 rounded bg-neutral-200" />
        </div>
        <div className="p-0">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 last:border-0">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-neutral-100" />
                <div className="space-y-2">
                  <div className="h-4 w-32 rounded bg-neutral-200" />
                  <div className="h-3 w-24 rounded bg-neutral-100" />
                </div>
              </div>
              <div className="h-8 w-20 rounded-md bg-neutral-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
