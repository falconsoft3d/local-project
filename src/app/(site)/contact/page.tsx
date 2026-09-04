export const metadata = {
  title: "Contacto — LoocalProject",
};

export default function ContactPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">Contacto</h1>
      <p className="mt-2 text-sm text-neutral-600">
        ¿Preguntas, ideas o problemas con LoocalProject? Escríbeme por cualquiera de estos
        medios.
      </p>

      <div className="mt-8 flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Nombre
          </p>
          <p className="mt-1 text-sm text-neutral-800">Marlon Falcón Hernández</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Teléfono
          </p>
          <a
            href="tel:+34662470645"
            className="mt-1 block text-sm text-green-700 hover:underline"
          >
            +34 662 470 645
          </a>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Correo
          </p>
          <a
            href="mailto:mfalconsoft@gmail.com"
            className="mt-1 block text-sm text-green-700 hover:underline"
          >
            mfalconsoft@gmail.com
          </a>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Web
          </p>
          <a
            href="https://www.marlonfalcon.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block text-sm text-green-700 hover:underline"
          >
            www.marlonfalcon.com
          </a>
        </div>
      </div>
    </div>
  );
}
