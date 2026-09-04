export const metadata = {
  title: "Política de cookies — LoocalProject",
};

export default function CookiesPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">Política de cookies</h1>
      <p className="mt-1 text-xs text-neutral-400">Última actualización: septiembre de 2026</p>

      <div className="prose-content mt-6">
        <h2>1. LoocalProject no usa cookies de seguimiento</h2>
        <p>
          LoocalProject no tiene servidor propio ni sistemas de analítica o publicidad, por lo
          que no instala cookies de rastreo ni comparte datos con terceros. Lo único que la
          aplicación guarda en tu navegador es <strong>almacenamiento local</strong>{" "}
          (<code>localStorage</code>), que técnicamente no es una cookie pero cumple una función
          similar: recordar tus preferencias entre visitas.
        </p>

        <h2>2. Qué se guarda en tu navegador</h2>
        <ul>
          <li>Tus proyectos (tareas, hitos, recursos y su programación), si eliges guardarlos en
            el navegador en lugar de en un archivo local.</li>
          <li>Las URL que hayas añadido para importar proyectos compartidos.</li>
          <li>El idioma de la interfaz (español o inglés).</li>
          <li>Si has minimizado o no la imagen de portada del inicio.</li>
          <li>Si ya has aceptado este aviso de cookies, para no volver a mostrarlo.</li>
        </ul>
        <p>Nada de esto se transmite a ningún servidor: permanece únicamente en tu dispositivo.</p>

        <h2>3. Sin cookies de terceros</h2>
        <p>
          LoocalProject no incluye píxeles de seguimiento, analítica de uso ni publicidad. No
          verás cookies de terceros al usar la aplicación.
        </p>

        <h2>4. Cómo borrar estos datos</h2>
        <p>
          Puedes eliminar todo lo guardado en cualquier momento borrando los datos del sitio
          desde la configuración de tu navegador (por ejemplo, en Chrome:{" "}
          <em>Configuración → Privacidad y seguridad → Configuración de sitios → Ver permisos y
          datos almacenados en todos los sitios</em>), o exportando primero tus proyectos si
          quieres conservarlos.
        </p>

        <h2>5. Más información</h2>
        <p>
          Consulta también nuestros{" "}
          <a href="/terms">Términos y condiciones</a>. Para cualquier duda, escribe a{" "}
          <a href="mailto:mfalconsoft@gmail.com">mfalconsoft@gmail.com</a>.
        </p>
      </div>
    </div>
  );
}
