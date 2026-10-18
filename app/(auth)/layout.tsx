/**
 * Auth layout — centered, no navigation bar.
 * Shared by /login, /change-password, etc.
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
