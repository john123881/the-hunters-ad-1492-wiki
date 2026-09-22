export function Emblem({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 80 96" fill="none" aria-hidden="true">
    <path d="M40 3 73 18v43L40 91 7 61V18Z" stroke="currentColor" strokeWidth="1.4" />
    <path d="M40 10 67 23v35L40 83 13 58V23Z" stroke="currentColor" opacity=".45" />
    <path d="M28 29v32m24-32v32M28 44h24" stroke="currentColor" strokeWidth="3" />
    <path d="m21 25 38 43M59 25 21 68" stroke="currentColor" opacity=".4" />
    <path d="m40 15 3 4-3 4-3-4Z" fill="currentColor" />
  </svg>;
}
