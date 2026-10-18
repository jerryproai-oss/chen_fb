import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/middleware';
import TopNav from '@/components/nav/TopNav';
import BottomNav from '@/components/nav/BottomNav';
import FloatingButton from '@/components/ui/FloatingButton';

/**
 * 主要頁面 layout — 需要認證，包含 TopNav + BottomNav
 * 用於 journal, family, write, posts, profile 等頁面
 */
export default async function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const ctx = await getCurrentUser();

  if (!ctx) {
    redirect('/login');
  }

  return (
    <>
      <TopNav />
      <main
        style={{
          minHeight: '100vh',
          paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {children}
      </main>
      <FloatingButton />
      <BottomNav />
    </>
  );
}
