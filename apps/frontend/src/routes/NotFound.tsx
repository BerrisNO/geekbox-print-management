import { Link } from '@tanstack/react-router';
import { FileQuestion } from 'lucide-react';
import { buttonVariants } from '../components/ui/button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <FileQuestion className="size-12 text-muted-foreground" aria-hidden />
      <div>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The page you are looking for does not exist.
        </p>
      </div>
      <Link to="/" className={buttonVariants({ variant: 'primary' })}>
        Back to dashboard
      </Link>
    </div>
  );
}
