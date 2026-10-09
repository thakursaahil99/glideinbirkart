import { AccountNav } from '@/components/store/account-views';
import { RequireAuth } from '@/components/layout/require-auth';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="container-page grid gap-6 py-6 sm:py-10 lg:grid-cols-[15rem_1fr]">
        <AccountNav />
        <div className="min-w-0">{children}</div>
      </div>
    </RequireAuth>
  );
}
