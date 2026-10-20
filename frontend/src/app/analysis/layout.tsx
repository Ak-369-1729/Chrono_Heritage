import type { Metadata } from "next";

export const metadata: Metadata = { title: "Analyses" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
