function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse bg-gray-800 rounded ${className}`} />;
}

export default function AppLoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Pulse className="h-7 w-48" />
          <Pulse className="h-4 w-72" />
        </div>
        <Pulse className="h-4 w-32" />
      </div>

      {/* Filter bar skeleton */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <Pulse className="h-9 w-40 rounded-lg" />
          <Pulse className="h-9 w-28 rounded-lg" />
          <Pulse className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* Chart cards skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <Pulse className="h-4 w-24" />
            <Pulse className="h-32 w-full rounded-lg" />
            <div className="flex gap-2">
              <Pulse className="h-3 w-16" />
              <Pulse className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <Pulse className="h-4 w-28" />
          <Pulse className="h-4 w-16" />
        </div>
        <div className="divide-y divide-gray-800">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="px-5 py-4 flex items-center gap-4">
              <Pulse className="h-9 w-9 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Pulse className="h-4 w-36" />
                <Pulse className="h-3 w-56" />
              </div>
              <Pulse className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
