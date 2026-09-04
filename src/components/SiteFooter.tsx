import { WhatsAppIcon, GitHubIcon } from "./icons";

export default function SiteFooter() {
  return (
    <footer className="mx-auto flex w-full max-w-5xl items-center justify-between border-t border-neutral-200 px-6 py-6 text-xs text-neutral-400">
      <div>
        <p className="font-medium text-neutral-500">Marlon Falcón Hernández</p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          <a href="tel:+34662470645" className="hover:text-neutral-600">
            +34 662 470 645
          </a>
          <a href="mailto:mfalconsoft@gmail.com" className="hover:text-neutral-600">
            mfalconsoft@gmail.com
          </a>
          <a
            href="https://www.marlonfalcon.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-neutral-600"
          >
            www.marlonfalcon.com
          </a>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <a
          href="https://wa.me/34662470645"
          target="_blank"
          rel="noopener noreferrer"
          title="WhatsApp"
          aria-label="WhatsApp"
          className="text-neutral-400 hover:text-green-600"
        >
          <WhatsAppIcon className="h-5 w-5" />
        </a>
        <a
          href="https://github.com/falconsoft3d/local-project"
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub"
          aria-label="GitHub"
          className="text-neutral-400 hover:text-neutral-900"
        >
          <GitHubIcon className="h-5 w-5" />
        </a>
      </div>
    </footer>
  );
}
