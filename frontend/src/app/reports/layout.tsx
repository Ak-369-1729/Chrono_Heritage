import type { Metadata } from "next";

export const metadata: Metadata = { title: "Research reports" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
