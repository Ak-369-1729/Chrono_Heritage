import Link from "next/link";

export default function NotFound() {
  return (
    <main className="chamber">
      <h1 className="display text-5xl">Nothing recorded here</h1>
      <p className="mt-4 max-w-xl text-ivory-dim">This page does not exist, or the record is private to someone else.</p>
      <div className="mt-6 flex gap-3"><Link href="/atlas" className="btn btn-primary">Open the Heritage Atlas</Link><Link href="/" className="btn btn-quiet">Home</Link></div>
    </main>
  );
}
