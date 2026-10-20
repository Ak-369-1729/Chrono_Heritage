import type { Metadata } from "next";

export const metadata: Metadata = { title: "Heritage Atlas" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
