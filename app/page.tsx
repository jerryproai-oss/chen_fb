import { redirect } from "next/navigation";

/**
 * Root page — redirect to login for now.
 * Will later redirect to /journal when authenticated.
 */
export default function HomePage() {
  redirect("/login");
}
