import { Head, Link } from '@inertiajs/react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NotAllowedProps {
  pageTitle?: string;
}

export default function NotAllowed({ pageTitle }: NotAllowedProps) {
  return (
    <>
      <Head title="Access Denied" />
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url('data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320"><path fill="currentColor" d="M0,96L48,112C96,128,192,160,288,186.7C384,213,480,235,576,213.3C672,192,768,128,864,128C960,128,1056,192,1152,208C1248,224,1344,192,1392,176L1440,160L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" fill="oklch(0.145 0 0 / 0.03)"/></svg>')}`,
          }}
        />
        <div className="relative z-10 mx-auto max-w-md px-4 text-center">
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-destructive/10 p-4">
              <ShieldAlert className="size-16 text-destructive" />
            </div>
          </div>
          <h1 className="mb-2 text-6xl font-bold tracking-tight text-foreground">403</h1>
          <h2 className="mb-2 text-xl font-semibold text-foreground">Access Denied</h2>
          <p className="mb-6 text-muted-foreground">
            {pageTitle
              ? `You do not have permission to access "${pageTitle}".`
              : 'You do not have permission to access this page.'}
          </p>
          <Button asChild>
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
