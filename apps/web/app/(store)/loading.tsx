import { Skeleton } from '@/components/ui/data';

export default function Loading() {
  return (
    <div className="container-page space-y-6 py-8" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-1/3" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
