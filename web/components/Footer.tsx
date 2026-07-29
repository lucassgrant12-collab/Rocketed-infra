import Link from "next/link";

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/disclosures", label: "Risk & Third-Party Disclosures" },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-neutral-200/70 dark:border-neutral-800">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Atlus Pay</p>
            <p className="mt-1 max-w-xs text-sm text-neutral-500 dark:text-neutral-400">
              A non-custodial way to pay with crypto at any checkout.
            </p>
          </div>

          <nav className="flex flex-col gap-2 text-sm sm:items-end">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-neutral-600 transition hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                {link.label}
              </Link>
            ))}
            <a
              href="mailto:lucassgrant12@gmail.com"
              className="text-neutral-600 transition hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              Contact
            </a>
          </nav>
        </div>

        <p className="mt-8 text-xs text-neutral-400 dark:text-neutral-600">
          &copy; {year} Atlus Pay. Currently running on the Sepolia test network with
          sandboxed card issuing. No real funds move through this deployment
          yet.
        </p>
      </div>
    </footer>
  );
}
