import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-neutral-200/70 dark:border-neutral-800">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-sm font-bold text-white dark:bg-white dark:text-neutral-900">
            A
          </div>
          <span className="font-semibold tracking-tight">Atlus Pay</span>
        </Link>
      </div>
    </header>
  );
}
