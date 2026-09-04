export const metadata = {
  title: "Términos y condiciones — LoocalProject",
};

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">Términos y condiciones</h1>
      <p className="mt-1 text-xs text-neutral-400">Última actualización: septiembre de 2026</p>

      <div className="prose-content mt-6">
        <h2>1. Objeto</h2>
        <p>
          LoocalProject es una herramienta gratuita para crear y editar cronogramas de
          proyectos (tareas, hitos, recursos y diagrama de Gantt) que se ejecuta enteramente en
          tu navegador. Al usar la aplicación aceptas estos términos.
        </p>

        <h2>2. Cómo funciona el servicio</h2>
        <p>
          LoocalProject no tiene servidor ni base de datos propia: no requiere registro ni
          cuenta de usuario. Tus proyectos se guardan, según elijas, en el almacenamiento local
          de tu navegador, en un archivo de tu equipo o vinculados a una URL que tú indiques.
          Ningún dato de tus proyectos se envía ni se almacena en servidores de LoocalProject.
        </p>
        <p>
          Algunas funciones (importar desde una URL, por ejemplo) hacen que tu navegador
          contacte directamente con la dirección que indiques; esa comunicación queda fuera del
          control de LoocalProject y está sujeta a las condiciones del sitio de destino.
        </p>

        <h2>3. Responsabilidad sobre tus datos</h2>
        <p>
          Como los proyectos se guardan localmente, eres tú quien es responsable de hacer copias
          de seguridad (por ejemplo, exportando a un archivo) si quieres conservarlos. Borrar los
          datos del sitio en tu navegador, cambiar de dispositivo o desinstalar el navegador
          puede hacer que pierdas el acceso a los proyectos guardados solo en el navegador.
        </p>

        <h2>4. Uso permitido</h2>
        <p>
          Puedes usar LoocalProject para fines personales o profesionales, sin restricciones de
          licencia. No está permitido usar la aplicación para actividades ilícitas ni intentar
          vulnerar su funcionamiento.
        </p>

        <h2>5. Exclusión de garantías</h2>
        <p>
          LoocalProject se ofrece &quot;tal cual&quot;, sin garantías de ningún tipo. No se
          garantiza que la aplicación esté libre de errores o interrupciones, ni la exactitud de
          los cálculos de calendario para ningún uso concreto. El uso de la herramienta es bajo
          tu propia responsabilidad.
        </p>

        <h2>6. Limitación de responsabilidad</h2>
        <p>
          En la medida permitida por la ley, no se asume responsabilidad por pérdidas de datos,
          decisiones tomadas a partir de la información generada por la aplicación, ni por daños
          derivados del uso o la imposibilidad de uso del servicio.
        </p>

        <h2>7. Modificaciones</h2>
        <p>
          Estos términos pueden actualizarse en cualquier momento; los cambios se reflejarán en
          esta misma página con la fecha de última actualización.
        </p>

        <h2>8. Contacto</h2>
        <p>
          Para cualquier consulta sobre estos términos, puedes escribir a{" "}
          <a href="mailto:mfalconsoft@gmail.com">mfalconsoft@gmail.com</a>.
        </p>
      </div>
    </div>
  );
}
