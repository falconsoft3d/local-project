/** Content of the in-app user manual (/manual), in Spanish and English.
 * Inline `**text**` marks on-screen labels (buttons, fields, tabs), shown in green like the
 * printed manual. */

export type ManualBlock =
  | { p: string }
  | { steps: string[] }
  | { list: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { note: { kind: "note" | "warn" | "important"; text: string } };

export interface ManualSection {
  id: string;
  num: string;
  title: string;
  lead: string;
  blocks: ManualBlock[];
}

export interface ManualContent {
  title: string;
  subtitle: string;
  tocTitle: string;
  noteLabels: Record<"note" | "warn" | "important", string>;
  openApp: string;
  sections: ManualSection[];
}

const es: ManualContent = {
  title: "Manual de uso",
  subtitle:
    "Cómo planificar y controlar el plazo de una obra con LoocalProject: Gantt, ruta crítica, calendario, recursos, línea base, seguimiento y valor ganado.",
  tocTitle: "Índice",
  noteLabels: { note: "Nota de obra", warn: "Atención", important: "Importante" },
  openApp: "Ir a mis proyectos",
  sections: [
    {
      id: "intro",
      num: "00",
      title: "Cómo funciona LoocalProject",
      lead: "Una herramienta de programación de obra que funciona entera en tu navegador: sin servidor y sin cuenta.",
      blocks: [
        {
          p: "Cada **proyecto** es un presupuesto de obra: los **capítulos** agrupan **partidas** (las tareas que se programan) e **hitos** (sucesos sin duración). Sobre esa estructura se calculan fechas, holguras, ruta crítica, carga de recursos y valor ganado.",
        },
        {
          table: {
            head: ["Modo", "Para qué"],
            rows: [
              ["**Planificación**", "El Gantt: fechas, vínculos, ruta crítica, recursos en el tiempo, línea base y seguimiento (capítulos 03 a 12)."],
              ["**Presupuesto**", "El presupuesto: recursos con coste y tipo (MO, MAT, EQ, SC), descompuestos de las partidas e importes (capítulo 13)."],
              ["**Informes**", "Programación (Gantt), presupuesto y cuantitativo de recursos en **PDF** y **Excel** (capítulo 14)."],
            ],
          },
        },
        {
          table: {
            head: ["Dónde se guarda", "Cómo"],
            rows: [
              ["En el navegador (por defecto)", "Los proyectos se guardan en el almacenamiento local. Nada sale de tu equipo."],
              ["En un archivo de tu ordenador", "**Guardar en carpeta** vincula el proyecto a un archivo .json y cada cambio se guarda en él (Chrome, Edge)."],
              ["Desde una URL", "**URL** descarga un proyecto JSON, XML de MS Project o BC3 público. Solo lectura: **Actualizar** trae la última versión."],
            ],
          },
        },
        {
          list: [
            "Idioma: **ES / EN** en la barra superior. Todo el programa está en español e inglés.",
            "Tema: el botón del sol / la luna cambia entre **modo claro** y **modo oscuro** (la primera vez sigue al sistema).",
            "**Ctrl+Z** (o **Deshacer**) revierte el último cambio, también un **Programar** o un **Ajustar**.",
          ],
        },
        {
          note: {
            kind: "important",
            text: "La programación nunca cambia cantidades, precios ni importes del presupuesto: solo fechas, duraciones y avance. Puedes programar y reprogramar sin miedo.",
          },
        },
      ],
    },
    {
      id: "start",
      num: "01",
      title: "Primeros pasos",
      lead: "Crea un proyecto vacío o importa uno existente.",
      blocks: [
        {
          steps: [
            "En **Inicio** pulsa **+ Nuevo proyecto** y ponle nombre, o pulsa **Importar** para abrir un archivo.",
            "Formatos admitidos: JSON de LoocalProject, XML de Microsoft Project y BC3 (FIEBDC-3). También puedes arrastrar el archivo sobre la imagen de inicio.",
            "Un BC3 trae capítulos, partidas, cantidades, precios y recursos (mano de obra, maquinaria y materiales), pero no fechas: usa **Ajustar** para un primer borrador y luego vincula las partidas.",
            "Abre el proyecto: verás la tabla editable a la izquierda y las barras del Gantt a la derecha.",
          ],
        },
        {
          p: "Orden de trabajo recomendado: 1) en **Presupuesto**, recursos con su tipo y precio y descompuestos de las partidas (si el BC3 ya los trae, revísalos), 2) calendario, 3) pestaña **Programación**, 4) duraciones, 5) vínculos, 6) restricciones solo donde haga falta, 7) **Programar** y revisar la ruta crítica, 8) carga de recursos, 9) **Guardar línea base**, 10) cada mes: fecha de estado, avance, reprogramar e informes.",
        },
      ],
    },
    {
      id: "where",
      num: "02",
      title: "Dónde está cada cosa",
      lead: "Todo vive en la pantalla del proyecto.",
      blocks: [
        {
          table: {
            head: ["Dónde", "Qué hay"],
            rows: [
              ["Cabecera › **Planificación | Presupuesto**", "Cambia entre el Gantt y el modo presupuesto (capítulo 13)."],
              ["Cabecera › **Programación**", "Tipo Duración, calendario, programar desde, programación automática, fecha de estado, líneas base, acciones de seguimiento y fotos de valor ganado."],
              ["Cabecera › **Recursos**", "Lista de recursos del proyecto: tipo (MO, MAT, EQ, SC), precio, unidad y Máx. ud."],
              ["Cabecera › **Importar / Exportar Gantt**", "Intercambio con MS Project (XML), Excel y CSV."],
              ["Barra 1", "**+ Capítulo**, **+ Partida**, **+ Subpartida**, **+ Hito**, sangrías, mover, **Ficha**, **Eliminar**, **Deshacer**, **Expandir / Contraer todo**, **Calendario**, **Comprobaciones**."],
              ["Barra 2", "**Ajustar**, **Programar**, **Ruta crítica**, filtro (**Solo críticas** / **Holgura negativa**), **Línea base**, **Hoy**, **Excel**, **PDF**, **Curva S**, **Recursos**, **Red**, **Variación**, **Informes** y escala **Día / Semana / Mes**."],
              ["Modo **Presupuesto**", "Totales por tipo, **Partidas** con descompuestos, **Recursos (precios básicos)**, **Recalcular precios desde recursos** e **Informes · PDF / Excel**."],
              ["Fila de la tabla", "Doble clic o el icono ⓘ abren la **ficha de la partida**; la columna **Recursos** abre los recursos de la partida."],
            ],
          },
        },
      ],
    },
    {
      id: "calendar",
      num: "03",
      title: "El calendario de la obra",
      lead: "El calendario decide qué días se trabaja: las duraciones y los desfases en días laborables solo cuentan sus días de trabajo.",
      blocks: [
        {
          table: {
            head: ["Campo", "Para qué sirve"],
            rows: [
              ["Código", "Nombre del calendario, por ejemplo «Valencia L-V»."],
              ["Lunes … Domingo", "Días de la semana que se trabaja."],
              ["Comienzo / Fin de la jornada", "Horario de trabajo (8:00 y 17:00 si no se indica)."],
              ["Horas por día", "Capacidad diaria de una unidad de recurso (8 h por defecto)."],
              ["Festivos y días no laborables", "Una línea por festivo con **De** y, si es un periodo (vacaciones, cierre de agosto), **Hasta**."],
            ],
          },
        },
        {
          p: "**Añadir festivos nacionales** carga los festivos nacionales de España del año indicado; añade a mano los autonómicos y locales. **Copiar de otro proyecto** reutiliza el calendario de otra obra.",
        },
        { p: "El Gantt sombrea los fines de semana y los festivos, y el motor de programación los salta." },
      ],
    },
    {
      id: "scheduling",
      num: "04",
      title: "La pestaña Programación",
      lead: "Aquí se decide cómo se programa el proyecto y desde aquí se hace el seguimiento.",
      blocks: [
        {
          table: {
            head: ["Campo", "Qué decide"],
            rows: [
              ["Tipo Duración", "**Rendimiento**: duración = cantidad ÷ rendimiento, redondeada hacia arriba y bloqueada (candado). **Fecha**: mandan las fechas; al mover el inicio se conserva el fin. **Manual**: manda la duración; mover el inicio mueve el fin."],
              ["Calendario", "Calendario de la obra (capítulo 03)."],
              ["Programar desde", "**Fecha de comienzo**: cada partida lo antes posible desde la Fecha Inicio. **Fecha de fin**: cada partida lo más tarde posible para acabar en la Fecha Fin; la holgura se mide hasta esa fecha."],
              ["Programación automática", "Si está activada, los cambios hechos en la ficha, el calendario o una importación mueven las sucesoras solas. El Gantt siempre lo hace."],
              ["Fecha de estado", "Día hasta el que se informa el avance. Se dibuja como una línea azul discontinua."],
              ["Comparar con", "Línea base activa: barras grises y variaciones."],
            ],
          },
        },
        {
          table: {
            head: ["Acción", "Qué hace"],
            rows: [
              ["Programar", "Coloca cada partida en la fecha más temprana que permiten sus vínculos, restricciones y calendario (o la más tardía si se programa desde el fin). Pide confirmación."],
              ["Guardar línea base", "Guarda fechas, duraciones e importes y la deja como línea de comparación."],
              ["Actualizar según lo programado", "Da por empezado lo que debía empezar antes de la fecha de estado y por terminado lo que debía terminar. Nunca baja un avance. Registra el valor ganado."],
              ["Reprogramar lo pendiente", "Lo no empezado no empieza antes de la fecha de estado; a lo empezado se le alarga lo que le falta. Lo real no se mueve."],
              ["Registrar avance", "Guarda una foto del valor ganado (PV, EV, AC) a la fecha de estado."],
              ["Variación, Recursos, Redistribuir, Red, Curva S, Informe, Comprobaciones", "Abren cada herramienta (capítulos 07 a 12)."],
            ],
          },
        },
        {
          note: {
            kind: "note",
            text: "Al abrir un proyecto antiguo se conserva su aspecto: la fecha de inicio pasa a ser la de la primera tarea y las tareas sin predecesoras reciben un «No comenzar antes del» con su fecha actual.",
          },
        },
      ],
    },
    {
      id: "task",
      num: "05",
      title: "La partida: duraciones, vínculos y restricciones",
      lead: "Solo se programan las partidas. Los capítulos abarcan desde el comienzo de su primera partida hasta el fin de la última.",
      blocks: [
        {
          table: {
            head: ["Campo de la ficha", "Qué es"],
            rows: [
              ["Inicio / Fin / Duración", "Duración en días laborables, contando el día de inicio y el de fin. Un hito tiene duración 0."],
              ["Duración transcurrida", "Cuenta todos los días, fines de semana y festivos incluidos (fraguados, curados). En el Gantt aparece en cursiva con «dt»."],
              ["Restricción y su fecha", "Lo antes posible, Lo más tarde posible, No comenzar antes / después del, No terminar antes / después del, Debe comenzar el, Debe terminar el."],
              ["Fecha límite", "Avisa sin mover la partida: si termina después, su holgura se vuelve negativa (▼ rojo en el Gantt)."],
              ["Holgura total / libre y Crítica", "Calculadas siempre. Crítica = holgura total igual o menor que 0."],
              ["Avance físico (%)", "Lo hecho en obra (no es la certificación). Con más de 0 se pone el Comienzo real; con 100, el Fin real."],
              ["% Cert.", "Porcentaje certificado. Se dibuja como relleno de la barra."],
              ["Comienzo real / Fin real", "Fechas reales. Poner un Fin real deja la partida al 100 %."],
              ["Duración restante, Línea base, Variación de fin", "Lo que falta y la diferencia en días laborables frente a la línea base (positivo = más tarde)."],
              ["Cantidad, Unidad, Precio, Importe", "Importe = cantidad × precio. Si la partida no tiene precio propio, se calcula con sus recursos."],
              ["Rendimiento, Tipo, Horas día", "De aquí sale la duración cuando el Tipo Duración es Rendimiento."],
            ],
          },
        },
        { p: "**Vínculos.** Cada predecesora tiene tipo y desfase. Un vínculo con un capítulo se aplica a todas sus partidas." },
        {
          table: {
            head: ["Tipo", "Código", "Significa"],
            rows: [
              ["Fin a Inicio", "FC", "Empieza cuando termina la predecesora. Es el más habitual."],
              ["Inicio a inicio", "CC", "Empieza cuando empieza la predecesora (más el desfase)."],
              ["Fin a Fin", "FF", "Termina cuando termina la predecesora."],
              ["Inicio a fin", "CF", "Termina cuando empieza la predecesora. Poco frecuente."],
            ],
          },
        },
        { p: "Desfase positivo para esperar y negativo para solapar, en **días laborables**, **días transcurridos** o **% de la predecesora**. En la columna **Predec.** se escriben con código:" },
        {
          table: {
            head: ["Escribe", "Significa"],
            rows: [
              ["01.02", "Fin-Comienzo con 01.02, sin desfase."],
              ["02.02FC+7dt", "Empieza 7 días transcurridos después de terminar 02.02 (fraguado)."],
              ["03.03CC+5", "Empieza 5 días laborables después del comienzo de 03.03."],
              ["04.01CC+50%", "Empieza a mitad de 04.01."],
              ["05.02FF", "Termina a la vez que 05.02."],
              ["06.01, 05.02FF", "Varias predecesoras separadas por coma."],
            ],
          },
        },
        {
          note: {
            kind: "warn",
            text: "No se permiten vínculos circulares. Si un código no existe, es un capítulo o crearía un ciclo, la celda se marca en rojo, se muestra el error arriba y el vínculo no se aplica. En el selector (flecha ▾) las partidas que crearían un ciclo aparecen desactivadas.",
          },
        },
        {
          p: "**Interrupciones.** En la pestaña **Interrupciones** de la ficha se indican paradas (lluvia, revisión del andamio, espera de material) con De, Hasta y Motivo. La partida conserva su duración, su fin se retrasa lo mismo y la barra se ve partida con un hueco punteado. Esos días no cuentan para la carga de recursos ni para el valor planificado.",
        },
      ],
    },
    {
      id: "gantt",
      num: "06",
      title: "El Gantt",
      lead: "Tabla editable a la izquierda y barras a la derecha.",
      blocks: [
        {
          list: [
            "Cambia duración, inicio, fin o predecesoras en la tabla, o arrastra las barras (y su borde derecho para la duración): las sucesoras se mueven solas.",
            "Mover una partida a mano le pone «No comenzar antes del» esa fecha, como en MS Project.",
            "Las partidas empezadas no se arrastran: su comienzo real queda fijo (● verde en la columna Inicio).",
            "El punto a la izquierda del nombre abre la paleta de colores; **Color por defecto** lo quita.",
            "La columna **Recursos** muestra las iniciales con el color de su tipo y abre la ventana de recursos de la partida (tipo, cantidad por unidad, precio, cuadrilla, añadir o quitar).",
          ],
        },
        {
          table: {
            head: ["En el Gantt", "Significa"],
            rows: [
              ["Barra negra", "Capítulo; a la derecha, su % certificado."],
              ["Barra verde o del color elegido", "Partida con holgura."],
              ["Barra roja", "Partida crítica (con **Ruta crítica** activado)."],
              ["Relleno de la barra", "Porcentaje certificado."],
              ["Franja oscura en la base", "Avance físico."],
              ["Barra fina gris debajo", "Fechas de la línea base (botón **Línea base**)."],
              ["Hueco punteado", "Interrupción."],
              ["Rombo", "Hito."],
              ["▼ rojo", "Fecha límite."],
              ["Línea azul discontinua / roja", "Fecha de estado / hoy."],
              ["Columnas sombreadas", "Fines de semana y festivos (escala Día y Semana)."],
            ],
          },
        },
        {
          p: "**Ajustar** encadena todas las partidas una tras otra con una duración fija o según la mano de obra (los días se dividen entre el número de recursos de mano de obra). **Excel** descarga un .xlsx con la tabla y el Gantt pintado en celdas según la escala; **PDF** abre la impresión del navegador en A4 apaisado.",
        },
        { note: { kind: "warn", text: "Ajustar sustituye las predecesoras de todas las partidas por una cadena Fin-Comienzo. Úsalo solo para empezar un programa de cero." } },
        {
          p: "Para un documento limpio de la programación usa **Informes** › **Programación (Gantt)** (capítulo 14); **Excel** y **PDF** de la barra exportan el Gantt tal como se ve en pantalla.",
        },
      ],
    },
    {
      id: "critical",
      num: "07",
      title: "Ruta crítica, holguras y diagrama de red",
      lead: "La ruta crítica es la cadena de partidas sin holgura: cualquier retraso en ellas retrasa el fin de la obra.",
      blocks: [
        {
          list: [
            "Es crítica la partida con holgura total igual o menor que 0; las terminadas dejan de ser críticas.",
            "Una holgura negativa indica una restricción o fecha límite que no se cumple (filtro **Holgura negativa**).",
            "Con Programar desde = fecha de fin, la holgura se mide hasta la Fecha Fin.",
          ],
        },
        {
          p: "**Red** abre el diagrama de red: cada cuadro muestra comienzo y fin tempranos, duración, comienzo y fin tardíos y holgura. En rojo la ruta crítica, en gris lo terminado y en cada flecha el tipo de vínculo y su desfase. Pulsa un cuadro para resaltar de qué depende y qué depende de él. La primera columna son las partidas sin predecesoras: la mejor forma de encontrar partidas «colgadas».",
        },
        { note: { kind: "note", text: "Si la ruta crítica no tiene sentido (salta de capítulo en capítulo sin lógica), casi siempre falta un vínculo o sobra una restricción." } },
      ],
    },
    {
      id: "resources",
      num: "08",
      title: "Recursos: histograma y redistribución",
      lead: "El histograma muestra cuántas horas pide la programación a cada recurso cada día y las compara con su capacidad.",
      blocks: [
        {
          table: {
            head: ["Elemento", "Qué es"],
            rows: [
              ["Tipos", "Solo la **mano de obra (MO)** y la **maquinaria (EQ)** cargan el histograma; materiales (MAT) y subcontratas (SC) solo suman coste."],
              ["Máx. ud.", "Personas o máquinas de ese recurso que pueden trabajar a la vez. 0 = sin límite."],
              ["Capacidad", "Máx. ud. × horas por día del calendario; la línea discontinua baja los festivos."],
              ["Incluir otras obras", "Suma lo que el recurso (mismo nombre) tiene en tus otros proyectos en las mismas fechas."],
              ["Sobreasignaciones", "Tramos de fechas, pico frente a capacidad y partidas implicadas."],
              ["Uso de recursos", "Horas por recurso y periodo; en rojo lo que pasa de la capacidad."],
            ],
          },
        },
        {
          p: "La carga de cada partida se reparte por igual entre sus días laborables. Con rendimiento: cuadrilla × horas día × cantidad ÷ rendimiento; con cantidades de recurso (BC3): cantidad por unidad × cantidad de la partida; si no, cuadrilla × horas por día durante la duración.",
        },
        {
          p: "**Redistribuir recursos** coloca las partidas por orden de comienzo, primero las críticas, en el primer día en que sus recursos caben. Respeta vínculos, calendario y restricciones. Con **Solo dentro de la holgura** no retrasa el fin de la obra. **Quitar redistribución** deshace los retrasos aplicados.",
        },
        { note: { kind: "warn", text: "Las partidas empezadas y las fijadas con «Debe comenzar el» o «Debe terminar el» no se mueven. Guarda antes una línea base para poder comparar (también puedes usar Deshacer)." } },
      ],
    },
    {
      id: "tracking",
      num: "09",
      title: "Línea base y seguimiento",
      lead: "La línea base es la foto aprobada del programa; el seguimiento compara cada mes lo que pasa en obra con esa foto.",
      blocks: [
        {
          steps: [
            "En **Programación** pon la **Fecha de estado**: el último día del periodo que informas.",
            "Pulsa **Actualizar según lo programado**: lo que debía empezar se da por empezado y lo que debía terminar, por terminado, con avance proporcional.",
            "Corrige lo que no ha ido así: en **Variación** o en el Gantt escribe el avance físico real y las fechas reales. Registra las interrupciones.",
            "Pulsa **Reprogramar lo pendiente**.",
            "Pulsa **Registrar avance** para guardar el valor ganado con el avance corregido.",
            "Revisa la ruta crítica, la variación y la carga de recursos.",
            "Imprime el **Informe de seguimiento** para la reunión de obra.",
          ],
        },
        { note: { kind: "note", text: "Hazlo siempre en este orden: si reprogramas antes de corregir el avance, las partidas retrasadas se colocan con un avance que no es el real." } },
        {
          p: "**Variación** lista las partidas por código con fechas de línea base, actuales y reales, avance y variación de fin: en rojo las que terminan después que en la línea base, en gris las terminadas. El **Informe de seguimiento** muestra el valor ganado, las partidas retrasadas con su motivo (terminan después que en la línea base, van 5 puntos o más por debajo de lo previsto o tienen holgura negativa), las críticas sin terminar y los recursos sobreasignados.",
        },
      ],
    },
    {
      id: "evm",
      num: "10",
      title: "Valor ganado y curva S",
      lead: "El valor ganado mide con dinero si la obra va adelantada o retrasada y si cuesta más o menos de lo previsto.",
      blocks: [
        {
          table: {
            head: ["Magnitud", "Cómo se calcula"],
            rows: [
              ["BAC", "Importe de la línea base activa (o del presupuesto si no hay línea base)."],
              ["PV", "Importe de cada partida en la línea base, repartido entre sus días laborables y acumulado hasta la fecha."],
              ["EV", "Avance físico × importe de línea base de cada partida, sumado. Cada foto de Registrar avance es un punto."],
              ["AC", "Suma de los **Costes reales** (facturas) introducidos en la curva S hasta la fecha."],
              ["Programación actual", "Como el PV, pero con las fechas actuales."],
              ["SV, SPI", "EV − PV y EV ÷ PV. SPI menor que 1 = retraso."],
              ["CV, CPI", "EV − AC y EV ÷ AC. CPI menor que 1 = sobrecoste."],
              ["EAC", "BAC ÷ CPI."],
            ],
          },
        },
        { note: { kind: "warn", text: "Sin costes reales introducidos, AC es 0 y no se calculan CV, CPI ni EAC." } },
      ],
    },
    {
      id: "exchange",
      num: "11",
      title: "MS Project, Excel y CSV",
      lead: "La programación viaja a MS Project (o ProjectLibre, GanttProject…) y vuelve.",
      blocks: [
        {
          steps: [
            "**Exportar Gantt**: elige Microsoft Project (XML), Excel o CSV y descarga.",
            "**Importar Gantt**: elige el tipo y el archivo. Con MS Project puedes **Importar calendario** e **Importar línea base** (línea base 0).",
            "**Crear faltantes** crea las tareas que no existen; **Llevar % completado a % Cert.** copia el avance a la certificación.",
          ],
        },
        { note: { kind: "warn", text: "Las tareas se reconocen por su número de exportación o por su código: exporta desde LoocalProject antes de editar en MS Project. La importación sustituye las predecesoras de las tareas que vienen en el archivo." } },
        { p: "Viajan: jerarquía, fechas y duraciones, transcurridas e hitos, vínculos FC/CC/FF/CF con su desfase, restricciones y fecha límite, calendario con festivos, avance y fechas reales, línea base y recursos. Los importes del presupuesto no cambian." },
      ],
    },
    {
      id: "checks",
      num: "12",
      title: "Errores frecuentes y comprobaciones",
      lead: "El botón **Comprobaciones** revisa automáticamente la lista antes de guardar la línea base.",
      blocks: [
        {
          table: {
            head: ["Síntoma", "Causa probable", "Solución"],
            rows: [
              ["Todo es crítico", "Programa en serie (Ajustar) o programado desde el fin.", "Revisar vínculos para trabajar en paralelo."],
              ["Nada es crítico salvo la última", "Partidas sin sucesora.", "Enlazar cada rama con un hito de fin de obra."],
              ["Holgura negativa", "Fecha límite o restricción imposible.", "Revisar la lógica o la fecha comprometida."],
              ["Una partida no se mueve al programar", "Está empezada o tiene «Debe comenzar el».", "Corregir el comienzo real o quitar la restricción."],
              ["No puedo cambiar la duración", "Tipo Duración = Rendimiento (candado).", "Cambiar cantidad o rendimiento, o pasar a Manual."],
              ["El fin sale antes de lo esperado", "Calendario sin festivos o con sábados.", "Revisar el calendario."],
              ["Las sucesoras no se mueven desde la ficha", "Programación automática desactivada.", "Activarla o pulsar Programar."],
              ["El histograma no marca sobreasignación", "Máx. ud. a 0 (sin límite).", "Poner la capacidad en Máx. ud."],
            ],
          },
        },
      ],
    },
    {
      id: "budget",
      num: "13",
      title: "Modo presupuesto",
      lead: "El interruptor **Planificación | Presupuesto** de la cabecera cambia el Gantt por el presupuesto de la obra.",
      blocks: [
        {
          p: "Los **recursos** llevan el coste y se clasifican en cuatro tipos. Cada **partida** suma sus recursos y los **capítulos** solo organizan: su importe es la suma de sus partidas.",
        },
        {
          table: {
            head: ["Tipo", "Significa", "Ejemplos"],
            rows: [
              ["MO", "Mano de obra", "Oficial albañil, peón ordinario (h)."],
              ["MAT", "Materiales", "Hormigón HA-25 (m³), ladrillo (ud)."],
              ["EQ", "Maquinaria y equipos", "Grúa torre, retroexcavadora (h)."],
              ["SC", "Subcontratas", "Instalación eléctrica completa (ud)."],
            ],
          },
        },
        {
          steps: [
            "En **Recursos (precios básicos)** crea los recursos, elige su tipo (MO, MAT, EQ, SC), su unidad y su **precio**.",
            "En **Partidas**, abre el descompuesto de una partida (▸) y pulsa **Añadir recurso…**; indica el rendimiento por unidad (p. ej. 0,35 h de oficial por m²).",
            "El precio de la partida (**Σ**) es la suma de rendimiento × precio de sus recursos; el importe es cantidad × precio.",
            "Arriba se ve el total por tipo (MO, MAT, EQ, SC), lo que está **sin descomponer** y el **total** del presupuesto de ejecución material.",
          ],
        },
        {
          note: {
            kind: "note",
            text: "Una partida importada de un BC3 conserva su precio del presupuesto. Si sus recursos suman otra cantidad aparece un **Σ** ámbar: púlsalo (o usa **Recalcular precios desde recursos**) para que la partida pase a sumar sus recursos. Al editar el descompuesto también se recalcula.",
          },
        },
        {
          p: "**Informes · PDF / Excel** abre el presupuesto (hasta capítulos, partidas o recursos) y el cuantitativo de recursos por tipo, en PDF y Excel (capítulo 14).",
        },
        { p: "Cambiar el precio de un recurso actualiza todas las partidas que lo usan. Solo la mano de obra y la maquinaria cargan el histograma de recursos; materiales y subcontratas solo suman coste." },
      ],
    },
    {
      id: "reports",
      num: "14",
      title: "Informes y exportaciones",
      lead: "Todos los informes están en una pantalla: **Informes** en la barra de Planificación o **Informes · PDF / Excel** en el modo Presupuesto.",
      blocks: [
        {
          table: {
            head: ["Informe", "Opciones", "Formato"],
            rows: [
              ["**Programación (Gantt)**", "Hasta **Capítulos** o **Partidas**; escala **Semana** o **Mes**; **Ruta crítica**, **Solo críticas** y **Línea base**. Tabla con código, duración, inicio, fin, predecesoras y holgura junto a las barras, con fecha de estado y leyenda.", "PDF (A4 apaisado) y Excel"],
              ["**Presupuesto**", "Hasta **Capítulos**, hasta **Partidas** (unidad, cantidad, precio, importe) o hasta **Recursos** (descompuestos con rendimiento, precio e importe por unidad). Incluye resumen por capítulos y por tipo de recurso y el total de ejecución material.", "PDF (A4) y Excel"],
              ["**Cuantitativo de recursos**", "Agrupado por tipo **MO**, **MAT**, **EQ** y **SC** (elige los tipos): cantidad total de cada recurso en la obra, precio, importe y nº de partidas, con subtotal por tipo.", "PDF (A4) y Excel"],
              ["**Informe de seguimiento**", "Desde la pestaña Programación: valor ganado a la fecha de estado, partidas retrasadas con motivo, críticas sin terminar y recursos sobreasignados.", "PDF (A4)"],
            ],
          },
        },
        {
          steps: [
            "Elige el informe y sus opciones: la vista previa se actualiza al momento.",
            "**PDF** abre el diálogo de impresión del navegador ya configurado (A4, vertical o apaisado): elige **Guardar como PDF** o imprime directamente. Solo se imprime el informe.",
            "**Excel** descarga un .xlsx con formato (capítulos resaltados, importes en euros, cabecera repetida en cada página impresa).",
          ],
        },
        {
          table: {
            head: ["Otras exportaciones", "Dónde"],
            rows: [
              ["Gantt tal como se ve (Excel con barras en celdas, PDF de pantalla)", "Barra de Planificación › **Excel** / **PDF**."],
              ["Microsoft Project (XML), Excel y CSV de la programación, para volver a importar", "Cabecera › **Exportar Gantt** / **Importar Gantt** (capítulo 11)."],
              ["Curva S y tabla de valor ganado", "**Curva S** › **Ver tabla**."],
              ["Proyecto completo (copia de seguridad)", "Cabecera › **JSON**."],
            ],
          },
        },
        {
          note: {
            kind: "note",
            text: "Los informes salen siempre en colores claros aunque uses el modo oscuro, y en el idioma elegido (ES / EN).",
          },
        },
      ],
    },
    {
      id: "glossary",
      num: "A",
      title: "Glosario y equivalencias con MS Project",
      lead: "Los términos de programación y cómo se llaman en MS Project.",
      blocks: [
        {
          table: {
            head: ["Término", "Definición", "MS Project"],
            rows: [
              ["Capítulo / Partida", "Tarea resumen / tarea.", "Tarea de resumen / Tarea"],
              ["Holgura total", "Retraso posible sin afectar al fin de la obra.", "Margen de demora total"],
              ["Holgura libre", "Retraso posible sin afectar a ninguna sucesora.", "Margen de demora permisible"],
              ["Ruta crítica", "Cadena de partidas sin holgura.", "Ruta crítica"],
              ["Desfase", "Espera (+) o solape (−) en un vínculo.", "Posposición / adelanto"],
              ["Duración transcurrida", "Duración en días naturales (dt).", "Duración transcurrida (ed)"],
              ["Restricción / Fecha límite", "Condición de fecha / aviso sin mover.", "Tipo de delimitación / Fecha límite"],
              ["Interrupciones", "Paradas de una partida.", "Dividir tarea"],
              ["Línea base", "Foto aprobada del programa.", "Establecer línea base"],
              ["Actualizar según lo programado", "Avance automático hasta la fecha de estado.", "Actualizar proyecto"],
              ["Reprogramar lo pendiente", "Mover lo pendiente tras la fecha de estado.", "Reprogramar trabajo no completado"],
              ["Máx. unidades / Redistribuir", "Capacidad del recurso / nivelar.", "Unidades máximas / Redistribuir recursos"],
              ["PV, EV, AC, SPI, CPI, EAC", "Magnitudes de valor ganado (capítulo 10).", "Igual"],
              ["MO, MAT, EQ, SC", "Tipos de recurso: mano de obra, materiales, maquinaria / equipos y subcontratas.", "Trabajo / Material / Costo"],
              ["Descompuesto", "Recursos de una partida con su rendimiento y precio por unidad.", "Asignaciones"],
              ["Rendimiento", "Cantidad de recurso por unidad de partida (p. ej. h/m²), o unidades de partida por día u hora.", "Unidades / Trabajo"],
              ["PEM", "Presupuesto de ejecución material: suma de todas las partidas.", "Costo total"],
              ["Cuantitativo", "Cantidad total de cada recurso en la obra.", "Uso de recursos"],
            ],
          },
        },
      ],
    },
  ],
};

const en: ManualContent = {
  title: "User manual",
  subtitle:
    "How to plan and control a construction schedule with LoocalProject: Gantt, critical path, calendar, resources, baseline, tracking and earned value.",
  tocTitle: "Contents",
  noteLabels: { note: "Site note", warn: "Warning", important: "Important" },
  openApp: "Go to my projects",
  sections: [
    {
      id: "intro",
      num: "00",
      title: "How LoocalProject works",
      lead: "A construction scheduling tool that runs entirely in your browser: no server, no account.",
      blocks: [
        {
          p: "Each **project** is a construction budget: **chapters** group **items** (the tasks that get scheduled) and **milestones** (zero-duration events). Dates, float, critical path, resource load and earned value are computed on top of that structure.",
        },
        {
          table: {
            head: ["Mode", "Purpose"],
            rows: [
              ["**Schedule**", "The Gantt: dates, links, critical path, resources over time, baseline and tracking (chapters 03 to 12)."],
              ["**Budget**", "The budget: resources with cost and type (LAB, MAT, EQP, SUB), item breakdowns and amounts (chapter 13)."],
              ["**Reports**", "Schedule (Gantt), budget and resource quantities as **PDF** and **Excel** (chapter 14)."],
            ],
          },
        },
        {
          table: {
            head: ["Where it is saved", "How"],
            rows: [
              ["In the browser (default)", "Projects are kept in local storage. Nothing leaves your computer."],
              ["In a file on your computer", "**Save to folder** links the project to a .json file and every change is written to it (Chrome, Edge)."],
              ["From a URL", "**URL** fetches a public JSON, MS Project XML or BC3 project. Read-only: **Refresh** pulls the latest version."],
            ],
          },
        },
        {
          list: [
            "Language: **ES / EN** in the top bar. The whole app is available in Spanish and English.",
            "Theme: the sun / moon button switches between **light mode** and **dark mode** (the first time it follows your system).",
            "**Ctrl+Z** (or **Undo**) reverts the last change, including a **Schedule** or an **Adjust**.",
          ],
        },
        {
          note: {
            kind: "important",
            text: "Scheduling never changes quantities, prices or amounts of the budget: only dates, durations and progress. Schedule and reschedule without fear.",
          },
        },
      ],
    },
    {
      id: "start",
      num: "01",
      title: "Getting started",
      lead: "Create an empty project or import an existing one.",
      blocks: [
        {
          steps: [
            "On **Home** press **+ New project** and name it, or press **Import** to open a file.",
            "Supported formats: LoocalProject JSON, Microsoft Project XML and BC3 (FIEBDC-3). You can also drop the file onto the home image.",
            "A BC3 brings chapters, items, quantities, prices and resources (labor, equipment and materials) but no dates: use **Adjust** for a first draft and then link the items.",
            "Open the project: the editable table is on the left and the Gantt bars on the right.",
          ],
        },
        {
          p: "Recommended order: 1) in **Budget**, resources with their type and price and the item breakdowns (review them if the BC3 already has them), 2) calendar, 3) **Scheduling** panel, 4) durations, 5) links, 6) constraints only where needed, 7) **Schedule** and review the critical path, 8) resource load, 9) **Save baseline**, 10) every month: status date, progress, reschedule and reports.",
        },
      ],
    },
    {
      id: "where",
      num: "02",
      title: "Where everything is",
      lead: "Everything lives in the project screen.",
      blocks: [
        {
          table: {
            head: ["Where", "What"],
            rows: [
              ["Header › **Schedule | Budget**", "Switches between the Gantt and budget mode (chapter 13)."],
              ["Header › **Scheduling**", "Duration type, calendar, schedule from, automatic scheduling, status date, baselines, tracking actions and earned-value photos."],
              ["Header › **Resources**", "Project resource list: type (LAB, MAT, EQP, SUB), price, unit and Max. units."],
              ["Header › **Import / Export Gantt**", "Exchange with MS Project (XML), Excel and CSV."],
              ["Toolbar 1", "**+ Chapter**, **+ Item**, **+ Sub-item**, **+ Milestone**, indent, move, **Task form**, **Delete**, **Undo**, **Expand / Collapse all**, **Calendar**, **Checks**."],
              ["Toolbar 2", "**Adjust**, **Schedule**, **Critical path**, filter (**Only critical** / **Negative float**), **Baseline**, **Today**, **Excel**, **PDF**, **S-curve**, **Resources**, **Network**, **Variance**, **Reports** and **Day / Week / Month** scale."],
              ["**Budget** mode", "Totals per type, **Items** with breakdowns, **Resources (unit prices)**, **Recalculate prices from resources** and **Reports · PDF / Excel**."],
              ["Table row", "Double-click or the ⓘ icon opens the **task form**; the **Resources** column opens the task's resources."],
            ],
          },
        },
      ],
    },
    {
      id: "calendar",
      num: "03",
      title: "The project calendar",
      lead: "The calendar decides which days are worked: durations and lags in working days only count its working days.",
      blocks: [
        {
          table: {
            head: ["Field", "Purpose"],
            rows: [
              ["Code", "Calendar name, e.g. “Valencia Mon-Fri”."],
              ["Monday … Sunday", "Days of the week that are worked."],
              ["Workday start / end", "Working hours (8:00 and 17:00 by default)."],
              ["Hours per day", "Daily capacity of one resource unit (8 h by default)."],
              ["Holidays and non-working days", "One line per holiday with **From** and, for a period (holidays, August closure), **To**."],
            ],
          },
        },
        {
          p: "**Add national holidays** loads Spain's national holidays for the chosen year; add regional and local ones by hand. **Copy from another project** reuses another job's calendar.",
        },
        { p: "The Gantt shades weekends and holidays, and the scheduling engine skips them." },
      ],
    },
    {
      id: "scheduling",
      num: "04",
      title: "The Scheduling panel",
      lead: "Here you decide how the project is scheduled, and all tracking starts here.",
      blocks: [
        {
          table: {
            head: ["Field", "What it decides"],
            rows: [
              ["Duration type", "**Performance**: duration = quantity ÷ performance, rounded up and locked (padlock). **Date**: dates rule; moving the start keeps the finish. **Manual**: duration rules; moving the start moves the finish."],
              ["Calendar", "Project calendar (chapter 03)."],
              ["Schedule from", "**Project start date**: every task as soon as possible from the Start Date. **Project finish date**: every task as late as possible to finish on the Finish Date; float is measured to that date."],
              ["Automatic scheduling", "When on, changes made in the task form, the calendar or an import move successors on their own. The Gantt always does."],
              ["Status date", "Day up to which progress is reported. Drawn as a dashed blue line."],
              ["Compare with", "Active baseline: grey bars and variances."],
            ],
          },
        },
        {
          table: {
            head: ["Action", "What it does"],
            rows: [
              ["Schedule", "Places every task on the earliest date its links, constraints and calendar allow (or the latest when scheduling from the finish). Asks for confirmation."],
              ["Save baseline", "Stores dates, durations and amounts and makes it the comparison baseline."],
              ["Update as scheduled", "Marks as started what should have started before the status date and as finished what should have finished. Never lowers progress. Records earned value."],
              ["Reschedule remaining work", "Work not started won't start before the status date; started work gets its remaining duration after it. Actual dates don't move."],
              ["Record progress", "Saves an earned-value photo (PV, EV, AC) at the status date."],
              ["Variance, Resources, Level, Network, S-curve, Report, Checks", "Open each tool (chapters 07 to 12)."],
            ],
          },
        },
        {
          note: {
            kind: "note",
            text: "Older projects keep their layout when opened: the start date becomes the first task's date and tasks without predecessors get a “Start no earlier than” on their current date.",
          },
        },
      ],
    },
    {
      id: "task",
      num: "05",
      title: "The task: durations, links and constraints",
      lead: "Only items are scheduled. Chapters span from the start of their first item to the finish of their last one.",
      blocks: [
        {
          table: {
            head: ["Task form field", "Meaning"],
            rows: [
              ["Start / Finish / Duration", "Duration in working days, counting both the start and the finish day. A milestone has duration 0."],
              ["Elapsed duration", "Counts every day, weekends and holidays included (curing, setting). Shown in italics with “dt” in the Gantt."],
              ["Constraint and date", "As soon as possible, As late as possible, Start no earlier / later than, Finish no earlier / later than, Must start on, Must finish on."],
              ["Deadline", "Warns without moving the task: finishing later makes its float negative (red ▼ in the Gantt)."],
              ["Total / free float and Critical", "Always computed. Critical = total float of 0 or less."],
              ["Physical progress (%)", "Work done on site (not the certification). Above 0 sets the Actual start; 100 sets the Actual finish."],
              ["% Cert.", "Certified percentage. Drawn as the bar fill."],
              ["Actual start / finish", "Actual dates. Setting an Actual finish puts the task at 100 %."],
              ["Remaining duration, Baseline, Finish variance", "What is left and the difference in working days against the baseline (positive = later)."],
              ["Quantity, Unit, Price, Amount", "Amount = quantity × price. Without its own price, the task is priced from its resources."],
              ["Performance, Type, Hours per day", "Source of the duration when the Duration type is Performance."],
            ],
          },
        },
        { p: "**Links.** Each predecessor has a type and a lag. A link with a chapter applies to all its items." },
        {
          table: {
            head: ["Type", "Code", "Meaning"],
            rows: [
              ["Finish to Start", "FS (FC)", "Starts when the predecessor finishes. The most common."],
              ["Start to Start", "SS (CC)", "Starts when the predecessor starts (plus the lag)."],
              ["Finish to Finish", "FF", "Finishes when the predecessor finishes."],
              ["Start to Finish", "SF (CF)", "Finishes when the predecessor starts. Rare."],
            ],
          },
        },
        { p: "Positive lag to wait, negative to overlap, in **working days**, **elapsed days** or **% of the predecessor**. In the **Preds.** column you type them with codes (Spanish and English codes are both accepted):" },
        {
          table: {
            head: ["Type", "Meaning"],
            rows: [
              ["01.02", "Finish-to-Start with 01.02, no lag."],
              ["02.02FS+7ed", "Starts 7 elapsed days after 02.02 finishes (curing). Also 02.02FC+7dt."],
              ["03.03SS+5", "Starts 5 working days after 03.03 starts."],
              ["04.01SS+50%", "Starts halfway through 04.01."],
              ["05.02FF", "Finishes together with 05.02."],
              ["06.01, 05.02FF", "Several predecessors separated by commas."],
            ],
          },
        },
        {
          note: {
            kind: "warn",
            text: "Circular links are not allowed. If a code doesn't exist, is a chapter or would create a loop, the cell turns red, the error shows at the top and the link is not applied. In the picker (▾ arrow) tasks that would create a loop are disabled.",
          },
        },
        {
          p: "**Interruptions.** In the task form's **Interruptions** tab you enter stops (rain, scaffold inspection, waiting for material) with From, To and Reason. The task keeps its duration, its finish moves by the same amount and the bar is drawn split with a dotted gap. Those days carry no resource load or planned value.",
        },
      ],
    },
    {
      id: "gantt",
      num: "06",
      title: "The Gantt",
      lead: "Editable table on the left, bars on the right.",
      blocks: [
        {
          list: [
            "Change duration, start, finish or predecessors in the table, or drag the bars (and their right edge for the duration): successors follow.",
            "Moving a task by hand gives it a “Start no earlier than” that date, as in MS Project.",
            "Started tasks can't be dragged: their actual start is fixed (green ● in the Start column).",
            "The dot left of the name opens the colour palette; **Default color** removes it.",
            "The **Resources** column shows initials in their type's colour and opens the task's resources (type, quantity per unit, price, crew, add or remove).",
          ],
        },
        {
          table: {
            head: ["In the Gantt", "Means"],
            rows: [
              ["Black bar", "Chapter; on its right, its certified %."],
              ["Green bar or chosen colour", "Task with float."],
              ["Red bar", "Critical task (with **Critical path** on)."],
              ["Bar fill", "Certified percentage."],
              ["Dark strip at the bottom", "Physical progress."],
              ["Thin grey bar below", "Baseline dates (**Baseline** button)."],
              ["Dotted gap", "Interruption."],
              ["Diamond", "Milestone."],
              ["Red ▼", "Deadline."],
              ["Dashed blue / red line", "Status date / today."],
              ["Shaded columns", "Weekends and holidays (Day and Week scale)."],
            ],
          },
        },
        {
          p: "**Adjust** chains every item one after another with a fixed duration or based on labor (days divided by the number of labor resources). **Excel** downloads an .xlsx with the table and the Gantt painted in cells at the current scale; **PDF** opens the browser's print dialog in landscape A4.",
        },
        { note: { kind: "warn", text: "Adjust replaces the predecessors of every task with a Finish-to-Start chain. Use it only to start a schedule from scratch." } },
        {
          p: "For a clean schedule document use **Reports** › **Schedule (Gantt)** (chapter 14); the toolbar **Excel** and **PDF** buttons export the Gantt as it looks on screen.",
        },
      ],
    },
    {
      id: "critical",
      num: "07",
      title: "Critical path, float and network diagram",
      lead: "The critical path is the chain of tasks without float: any delay on it delays the end of the job.",
      blocks: [
        {
          list: [
            "A task is critical when its total float is 0 or less; finished tasks stop being critical.",
            "Negative float means a constraint or deadline can't be met (**Negative float** filter).",
            "When scheduling from the finish date, float is measured to the Finish Date.",
          ],
        },
        {
          p: "**Network** opens the network diagram: each box shows early start and finish, duration, late start and finish and float. Critical path in red, finished work in grey, and each arrow shows the link type and lag. Click a box to highlight what it depends on and what depends on it. The first column holds the tasks without predecessors: the best way to find “dangling” tasks.",
        },
        { note: { kind: "note", text: "If the critical path makes no sense (jumping between chapters without logic), a link is almost always missing or a constraint is left over." } },
      ],
    },
    {
      id: "resources",
      num: "08",
      title: "Resources: histogram and leveling",
      lead: "The histogram shows how many hours the schedule asks of each resource every day, compared with its capacity.",
      blocks: [
        {
          table: {
            head: ["Element", "Meaning"],
            rows: [
              ["Types", "Only **labor (LAB)** and **equipment (EQP)** load the histogram; materials (MAT) and subcontracts (SUB) only add cost."],
              ["Max. units", "People or machines of that resource that can work at the same time. 0 = unlimited."],
              ["Capacity", "Max. units × calendar hours per day; the dashed line drops on holidays."],
              ["Include other projects", "Adds what the same-named resource has in your other projects on the same dates."],
              ["Over-allocations", "Date ranges, peak vs capacity and tasks involved."],
              ["Resource usage", "Hours per resource and period; over-capacity values in red."],
            ],
          },
        },
        {
          p: "Each task's load is spread evenly over its working days. With performance: crew × hours per day × quantity ÷ performance; with resource quantities (BC3): quantity per unit × task quantity; otherwise crew × hours per day over the duration.",
        },
        {
          p: "**Level resources** places tasks by start order, critical first, on the first day their resources fit. It respects links, calendar and constraints. With **Only within float** the end of the job is not delayed. **Clear leveling** removes the delays it applied.",
        },
        { note: { kind: "warn", text: "Started tasks and tasks fixed with “Must start on” or “Must finish on” don't move. Save a baseline first so you can compare (Undo also works)." } },
      ],
    },
    {
      id: "tracking",
      num: "09",
      title: "Baseline and tracking",
      lead: "The baseline is the approved photo of the schedule; tracking compares what happens on site with it every month.",
      blocks: [
        {
          steps: [
            "In **Scheduling** set the **Status date**: the last day of the period you report.",
            "Press **Update as scheduled**: what should have started is marked as started and what should have finished as finished, with proportional progress.",
            "Fix what didn't go as planned: in **Variance** or the Gantt enter the real physical progress and actual dates. Record interruptions.",
            "Press **Reschedule remaining work**.",
            "Press **Record progress** to save earned value with the corrected progress.",
            "Review the critical path, the variance and the resource load.",
            "Print the **Tracking report** for the site meeting.",
          ],
        },
        { note: { kind: "note", text: "Always follow this order: if you reschedule before fixing progress, late tasks are placed with progress that isn't real." } },
        {
          p: "**Variance** lists tasks by code with baseline, current and actual dates, progress and finish variance: red when finishing after the baseline, grey when finished. The **Tracking report** shows earned value, late tasks with their reason (finish after the baseline, 5 or more points behind plan, or negative float), unfinished critical tasks and over-allocated resources.",
        },
      ],
    },
    {
      id: "evm",
      num: "10",
      title: "Earned value and S-curve",
      lead: "Earned value measures in money whether the job is ahead or behind and whether it costs more or less than planned.",
      blocks: [
        {
          table: {
            head: ["Measure", "How it is computed"],
            rows: [
              ["BAC", "Amount of the active baseline (or the budget when there is no baseline)."],
              ["PV", "Each task's baseline amount, spread over its working days and accumulated to the date."],
              ["EV", "Physical progress × baseline amount of each task, summed. Each Record progress photo is a point."],
              ["AC", "Sum of the **Actual costs** (invoices) entered in the S-curve up to the date."],
              ["Current schedule", "Like PV, but with the current dates."],
              ["SV, SPI", "EV − PV and EV ÷ PV. SPI below 1 = behind schedule."],
              ["CV, CPI", "EV − AC and EV ÷ AC. CPI below 1 = over cost."],
              ["EAC", "BAC ÷ CPI."],
            ],
          },
        },
        { note: { kind: "warn", text: "Without actual costs entered, AC is 0 and CV, CPI and EAC are not computed." } },
      ],
    },
    {
      id: "exchange",
      num: "11",
      title: "MS Project, Excel and CSV",
      lead: "The schedule travels to MS Project (or ProjectLibre, GanttProject…) and back.",
      blocks: [
        {
          steps: [
            "**Export Gantt**: choose Microsoft Project (XML), Excel or CSV and download.",
            "**Import Gantt**: choose the type and the file. With MS Project you can **Import calendar** and **Import baseline** (baseline 0).",
            "**Create missing** creates tasks that don't exist; **Copy % complete to % Cert.** copies progress into the certification.",
          ],
        },
        { note: { kind: "warn", text: "Tasks are matched by their export number or their code: export from LoocalProject before editing in MS Project. Importing replaces the predecessors of the tasks in the file." } },
        { p: "What travels: hierarchy, dates and durations, elapsed durations and milestones, FS/SS/FF/SF links with lag, constraints and deadline, calendar with holidays, progress and actual dates, baseline and resources. Budget amounts never change." },
      ],
    },
    {
      id: "checks",
      num: "12",
      title: "Common problems and checks",
      lead: "The **Checks** button reviews the pre-baseline checklist automatically.",
      blocks: [
        {
          table: {
            head: ["Symptom", "Likely cause", "Fix"],
            rows: [
              ["Everything is critical", "Serial schedule (Adjust) or scheduled from the finish.", "Review links so work runs in parallel."],
              ["Nothing is critical but the last task", "Tasks without successors.", "Link every branch to a project-finish milestone."],
              ["Negative float", "Impossible deadline or constraint.", "Review the logic or the committed date."],
              ["A task doesn't move when scheduling", "It has started or has “Must start on”.", "Fix the actual start or remove the constraint."],
              ["I can't change the duration", "Duration type = Performance (padlock).", "Change quantity or performance, or switch to Manual."],
              ["The finish is earlier than expected", "Calendar without holidays or with Saturdays.", "Review the calendar."],
              ["Successors don't move from the form", "Automatic scheduling is off.", "Turn it on or press Schedule."],
              ["The histogram shows no over-allocation", "Max. units at 0 (unlimited).", "Set the capacity in Max. units."],
            ],
          },
        },
      ],
    },
    {
      id: "budget",
      num: "13",
      title: "Budget mode",
      lead: "The **Schedule | Budget** switch in the header swaps the Gantt for the job's budget.",
      blocks: [
        {
          p: "**Resources** carry the cost and are classified in four types. Each **item** adds up its resources and **chapters** only organise: their amount is the sum of their items.",
        },
        {
          table: {
            head: ["Type", "Meaning", "Examples"],
            rows: [
              ["LAB", "Labor", "Bricklayer, laborer (h)."],
              ["MAT", "Materials", "HA-25 concrete (m³), brick (u)."],
              ["EQP", "Equipment and machinery", "Tower crane, backhoe (h)."],
              ["SUB", "Subcontracts", "Complete electrical installation (u)."],
            ],
          },
        },
        {
          steps: [
            "In **Resources (unit prices)** create the resources and choose their type (LAB, MAT, EQP, SUB), unit and **price**.",
            "In **Items**, open an item's breakdown (▸) and press **Add resource…**; enter the yield per unit (e.g. 0.35 h of bricklayer per m²).",
            "The item price (**Σ**) is the sum of yield × price of its resources; the amount is quantity × price.",
            "The top shows the total per type (LAB, MAT, EQP, SUB), what is **without breakdown** and the **total** execution budget.",
          ],
        },
        {
          note: {
            kind: "note",
            text: "An item imported from a BC3 keeps its budget price. If its resources add up to a different amount an amber **Σ** appears: click it (or use **Recalculate prices from resources**) so the item adds up its resources. Editing the breakdown also recalculates it.",
          },
        },
        {
          p: "**Reports · PDF / Excel** opens the budget (down to chapters, items or resources) and the resource quantities by type, as PDF and Excel (chapter 14).",
        },
        { p: "Changing a resource price updates every item that uses it. Only labor and equipment load the resource histogram; materials and subcontracts only add cost." },
      ],
    },
    {
      id: "reports",
      num: "14",
      title: "Reports and exports",
      lead: "All reports are on one screen: **Reports** in the Schedule toolbar or **Reports · PDF / Excel** in Budget mode.",
      blocks: [
        {
          table: {
            head: ["Report", "Options", "Format"],
            rows: [
              ["**Schedule (Gantt)**", "Down to **Chapters** or **Items**; **Week** or **Month** scale; **Critical path**, **Only critical** and **Baseline**. A table with code, duration, start, finish, predecessors and float next to the bars, with status date and legend.", "PDF (landscape A4) and Excel"],
              ["**Budget**", "Down to **Chapters**, **Items** (unit, quantity, price, amount) or **Resources** (breakdowns with yield, price and amount per unit). Includes a summary by chapter and by resource type and the execution budget total.", "PDF (A4) and Excel"],
              ["**Resource quantities**", "Grouped by type **LAB**, **MAT**, **EQP** and **SUB** (pick the types): total quantity of each resource on the job, price, amount and number of items, with a subtotal per type.", "PDF (A4) and Excel"],
              ["**Tracking report**", "From the Scheduling panel: earned value at the status date, late tasks with reason, unfinished critical tasks and over-allocated resources.", "PDF (A4)"],
            ],
          },
        },
        {
          steps: [
            "Choose the report and its options: the preview updates right away.",
            "**PDF** opens the browser print dialog already set up (A4, portrait or landscape): choose **Save as PDF** or print directly. Only the report is printed.",
            "**Excel** downloads a formatted .xlsx (highlighted chapters, euro amounts, header repeated on every printed page).",
          ],
        },
        {
          table: {
            head: ["Other exports", "Where"],
            rows: [
              ["Gantt as shown (Excel with bars in cells, on-screen PDF)", "Schedule toolbar › **Excel** / **PDF**."],
              ["Microsoft Project (XML), Excel and CSV of the schedule, to import back", "Header › **Export Gantt** / **Import Gantt** (chapter 11)."],
              ["S-curve and earned-value table", "**S-curve** › **Show table**."],
              ["Whole project (backup)", "Header › **JSON**."],
            ],
          },
        },
        {
          note: {
            kind: "note",
            text: "Reports always print in light colours even in dark mode, and in the chosen language (ES / EN).",
          },
        },
      ],
    },
    {
      id: "glossary",
      num: "A",
      title: "Glossary and MS Project equivalents",
      lead: "Scheduling terms and their MS Project names.",
      blocks: [
        {
          table: {
            head: ["Term", "Definition", "MS Project"],
            rows: [
              ["Chapter / Item", "Summary task / task.", "Summary task / Task"],
              ["Total float", "Delay allowed without delaying the end of the job.", "Total slack"],
              ["Free float", "Delay allowed without delaying any successor.", "Free slack"],
              ["Critical path", "Chain of tasks without float.", "Critical path"],
              ["Lag", "Wait (+) or overlap (−) on a link.", "Lag / lead"],
              ["Elapsed duration", "Duration in calendar days (ed).", "Elapsed duration (ed)"],
              ["Constraint / Deadline", "Date condition / warning without moving.", "Constraint type / Deadline"],
              ["Interruptions", "Stops of a task.", "Split task"],
              ["Baseline", "Approved photo of the schedule.", "Set baseline"],
              ["Update as scheduled", "Automatic progress up to the status date.", "Update project"],
              ["Reschedule remaining work", "Move pending work after the status date.", "Reschedule uncompleted work"],
              ["Max. units / Level", "Resource capacity / leveling.", "Max units / Level resources"],
              ["PV, EV, AC, SPI, CPI, EAC", "Earned-value measures (chapter 10).", "Same"],
              ["LAB, MAT, EQP, SUB", "Resource types: labor, materials, equipment and subcontracts.", "Work / Material / Cost"],
              ["Breakdown", "An item's resources with yield and price per unit.", "Assignments"],
              ["Yield", "Resource quantity per item unit (e.g. h/m²), or item units per day or hour.", "Units / Work"],
              ["Execution budget", "Sum of all the items.", "Total cost"],
              ["Resource quantities", "Total quantity of each resource on the job.", "Resource usage"],
            ],
          },
        },
      ],
    },
  ],
};

export const manualContent: Record<"es" | "en", ManualContent> = { es, en };
