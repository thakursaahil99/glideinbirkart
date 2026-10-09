'use client';

import { useEffect } from 'react';
import { RotateCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="grid min-h-[70dvh] place-content-center px-6 text-center">
      <div className="mx-auto mb-5 grid size-16 place-content-center rounded-3xl bg-destructive/12 text-destructive">
        <TriangleAlert className="size-8" />
      </div>
      <h1 className="font-display text-3xl font-extrabold">Something went wrong</h1>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">
        An unexpected error occurred. Please try again — if it keeps happening, contact support
        {error.digest ? ` (ref ${error.digest})` : ''}.
      </p>
      <Button onClick={reset} size="lg" className="mx-auto mt-6">
        <RotateCw /> Try again
      </Button>
    </main>
  );
}
