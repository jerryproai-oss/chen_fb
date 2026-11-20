import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/middleware";

/**
 * Root page
 * - 已登入 → 跳轉到 /bulletin（首頁）
 * - 未登入 → 跳轉到 /login
 */
export default async function HomePage() {
  const ctx = await getCurrentUser();

  if (!ctx) {
    redirect("/login");
  }

  redirect("/bulletin");
}
