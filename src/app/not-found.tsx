import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-paper flex flex-col items-center justify-center px-6 text-center">
      <Logo className="h-9" />
      <p className="mt-10 font-display text-7xl font-bold text-brand-gradient">404</p>
      <h1 className="mt-3 font-display text-2xl font-bold text-evergreen-deep">This page doesn&rsquo;t exist</h1>
      <p className="mt-2 max-w-sm text-zinc-600">The link may be old, or the address may have a typo. You can go back home, or sign in to find your shop.</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className="press inline-flex items-center justify-center min-h-[48px] px-6 rounded-full bg-evergreen text-white font-semibold hover:bg-evergreen-deep transition-colors">
          Go home
        </Link>
        <Link href="/login" className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-full border-2 border-evergreen/25 text-evergreen-deep font-semibold hover:border-evergreen hover:bg-white transition-colors">
          Find your shop
        </Link>
      </div>
    </main>
  );
}
