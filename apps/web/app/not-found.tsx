import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-content-center bg-paper px-6 text-center">
      <div className="mx-auto mb-5 grid size-20 place-content-center rounded-3xl bg-secondary text-primary">
        <Compass className="size-10" />
      </div>
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary">Error 404</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
        This aisle doesn’t exist
      </h1>
      <p className="mx-auto mt-3 max-w-md text-muted-foreground">
        The page you’re looking for moved, sold out, or never existed. Let’s get you back to
        shopping.
      </p>
      <div className="mt-7 flex justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/">Back to home</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/search">Browse products</Link>
        </Button>
      </div>
    </main>
  );
}
