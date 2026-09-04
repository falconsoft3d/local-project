function base(children: React.ReactNode, className = "h-4 w-4") {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

function baseFill(children: React.ReactNode, className = "h-4 w-4") {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      {children}
    </svg>
  );
}

export function WhatsAppIcon({ className }: { className?: string }) {
  return baseFill(
    <path d="M12.02 2C6.5 2 2.02 6.48 2.02 12c0 1.77.46 3.45 1.34 4.93L2 22l5.2-1.36a9.96 9.96 0 0 0 4.82 1.23h.01c5.52 0 10-4.48 10-10S17.55 2 12.02 2Zm0 18.06h-.01a8.3 8.3 0 0 1-4.24-1.16l-.3-.18-3.08.81.82-3-.2-.31a8.29 8.29 0 0 1-1.27-4.42c0-4.59 3.73-8.32 8.3-8.32 2.22 0 4.3.86 5.87 2.43a8.24 8.24 0 0 1 2.43 5.87c0 4.59-3.74 8.32-8.32 8.32Zm4.56-6.22c-.25-.12-1.47-.72-1.7-.81-.23-.08-.4-.12-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.04-.38-1.99-1.22-.73-.66-1.23-1.46-1.37-1.71-.15-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.02 2.56.12.17 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.23-.16-.48-.28Z" />,
    className,
  );
}

export function GitHubIcon({ className }: { className?: string }) {
  return baseFill(
    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.16-.02-2.11-3.2.7-3.87-1.36-3.87-1.36-.53-1.33-1.29-1.69-1.29-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 2.89-.39c.98 0 1.97.13 2.89.39 2.21-1.49 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.43-2.69 5.4-5.26 5.69.41.36.79 1.06.79 2.14 0 1.54-.01 2.79-.01 3.17 0 .3.21.66.79.55A10.99 10.99 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />,
    className,
  );
}

export function PencilIcon({ className }: { className?: string }) {
  return base(
    <>
      <path d="M12.9 3.9 16.1 7.1 6.6 16.6 3 17.5l.9-3.6 9-9Z" />
      <path d="M11.3 5.5 14.5 8.7" />
    </>,
    className,
  );
}

export function CopyIcon({ className }: { className?: string }) {
  return base(
    <>
      <rect x="7.5" y="7.5" width="9" height="9" rx="1.2" />
      <path d="M4.5 12.5v-8a1 1 0 0 1 1-1h8" />
    </>,
    className,
  );
}

export function DownloadIcon({ className }: { className?: string }) {
  return base(
    <>
      <path d="M10 3v10" />
      <path d="M6 9.5 10 13.5 14 9.5" />
      <path d="M4 15.5h12" />
    </>,
    className,
  );
}

export function FileCodeIcon({ className }: { className?: string }) {
  return base(
    <>
      <path d="M6 3h5.5L15 6.5V17H6z" />
      <path d="M11.5 3v3.5H15" />
      <path d="M8 12.2 6.8 13.4 8 14.6" />
      <path d="M10.8 12.2 12 13.4l-1.2 1.2" />
    </>,
    className,
  );
}

export function ChevronUpIcon({ className }: { className?: string }) {
  return base(<path d="M5 12.5 10 7.5l5 5" />, className);
}

export function ChevronDownIcon({ className }: { className?: string }) {
  return base(<path d="M5 7.5 10 12.5l5-5" />, className);
}

export function FolderIcon({ className }: { className?: string }) {
  return base(
    <path d="M3 6.2a1 1 0 0 1 1-1h3.6l1.6 1.8H16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6.2Z" />,
    className,
  );
}

export function XCircleIcon({ className }: { className?: string }) {
  return base(
    <>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M7.5 7.5 12.5 12.5" />
      <path d="M12.5 7.5 7.5 12.5" />
    </>,
    className,
  );
}

export function LinkIcon({ className }: { className?: string }) {
  return base(
    <>
      <path d="M8.2 11.8a3 3 0 0 0 4.2.2l2.2-2.2a3 3 0 0 0-4.2-4.2l-1.2 1.2" />
      <path d="M11.8 8.2a3 3 0 0 0-4.2-.2L5.4 10.2a3 3 0 0 0 4.2 4.2l1.2-1.2" />
    </>,
    className,
  );
}

export function RefreshIcon({ className }: { className?: string }) {
  return base(
    <>
      <path d="M4 10a6 6 0 0 1 10.2-4.2L16 7.5" />
      <path d="M16 4v3.5h-3.5" />
      <path d="M16 10a6 6 0 0 1-10.2 4.2L4 12.5" />
      <path d="M4 16v-3.5h3.5" />
    </>,
    className,
  );
}

export function TrashIcon({ className }: { className?: string }) {
  return base(
    <>
      <path d="M4.5 5.5h11" />
      <path d="M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" />
      <path d="M6 5.5 6.6 16a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L14 5.5" />
      <path d="M8.3 8.5v5" />
      <path d="M11.7 8.5v5" />
    </>,
    className,
  );
}
