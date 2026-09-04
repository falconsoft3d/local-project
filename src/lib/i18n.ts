export type Language = "en" | "es";

type Dict = Record<string, string>;

export const translations: Record<Language, Dict> = {
  en: {
    appName: "LoocalProject",
    appTagline: "Small project schedules, kept entirely in this browser.",
    import: "Import",
    newProject: "+ New project",
    noProjectsYet: "No projects yet. Create one to build your first schedule.",
    tasksCount: "{count} task",
    tasksCountPlural: "{count} tasks",
    resourcesCount: "{count} resource",
    resourcesCountPlural: "{count} resources",
    noTasksYetShort: "No tasks yet",
    updated: "Updated {date}",
    rename: "Rename",
    duplicate: "Duplicate",
    export: "Export",
    exportXml: "Export XML",
    delete: "Delete",
    deleteProjectConfirm: 'Delete "{name}"? This cannot be undone.',
    importInvalidFile:
      "This file doesn't look like a valid local-project export or MS Project XML file.",
    newProjectTitle: "New project",
    renameProjectTitle: "Rename project",
    projectName: "Project name",
    defaultNewProjectName: "New Project",
    cancel: "Cancel",
    create: "Create",
    save: "Save",
    language: "Language",

    backToProjects: "← Projects",
    resourcesButton: "Resources ({count})",
    exportMsProjectXml: "Export MS Project XML",
    exportMsProjectXmlFailed: "Couldn't export this project back to MS Project XML.",
    addTask: "+ Task",
    addSubtask: "+ Subtask",
    addMilestone: "+ Milestone",
    indent: "Indent",
    outdent: "Outdent",
    moveUp: "Move up",
    moveDown: "Move down",
    day: "Day",
    week: "Week",
    month: "Month",
    noTasksYet: "No tasks yet.",
    addFirstTask: "+ Add your first task",
    deleteTaskConfirm: 'Delete "{name}"{andSubtasks}?',
    andItsSubtasks: " and its subtasks",
    projectNotFound: "Project not found.",

    colWbs: "WBS",
    colTaskName: "Task Name",
    colDuration: "Duration",
    colStart: "Start",
    colFinish: "Finish",
    colPreds: "Preds",
    colResources: "Resources",
    colProgress: "% Comp",
    noResourcesYet: "No resources yet.",

    resourcesTitle: "Resources",
    newResourceName: "New resource name",
    add: "Add",
    tasksSuffix: "task",
    tasksSuffixPlural: "tasks",
    removeResourceConfirm: 'Remove "{name}" from all tasks and delete it?',
    resourceKindLabor: "Labor",
    resourceKindMaterial: "Material",
    resourceKindEquipment: "Equipment",

    adjust: "Adjust",
    adjustModalTitle: "Adjust schedule",
    adjustModalIntro:
      "This overwrites the duration and predecessors of every task (not milestones or summary tasks).",
    adjustDaysLabel: "Days per task",
    adjustFixedTitle: "Fixed days per task",
    adjustFixedDesc:
      "Sets every task's duration to {days} days and chains them one after another automatically.",
    adjustLaborTitle: "Days based on labor resources",
    adjustLaborDesc:
      "Same as above, but divides the {days} days by the number of labor resources assigned to each task (minimum 1 day). Tasks with no labor resource assigned stay at {days} days.",

    taskColor: "Color",
    defaultColor: "Default color",

    hideImage: "Hide image",
    showImage: "Show image",
    dropToImport: "Drop to import",

    openFromFolder: "Folder",
    openFromFolderHint: "Open a project from a local file",
    saveToFolder: "Save to folder",
    closeProject: "Close",
    closeFileProjectConfirm: 'Close "{name}"? The file on disk won\'t be affected.',
    linkedToFile: "Linked to file",
    fileSaved: "saved",
    fileSaving: "saving…",
    fileErrorStatus: "couldn't save",
    openFileFailed: "Couldn't open that file — it may not be a valid local-project file.",
    saveFileFailed: "Couldn't save the project to that file.",

    addFromUrl: "URL",
    addFromUrlTitle: "Add project from URL",
    addFromUrlHelp:
      "Fetches a local-project JSON, MS Project XML, or BC3 file from a public URL. Read-only — your edits here stay local; use Refresh to pull the latest version. Doesn't work with Google Drive, Dropbox, or similar share links (they block this kind of request) — only with URLs that serve the raw file and allow cross-origin access.",
    urlLabel: "File URL",
    addFromUrlFailed:
      "Couldn't fetch that URL. Make sure it's public, points directly to the file, and allows cross-origin requests.",
    fromUrl: "From URL",
    refresh: "Refresh",
    refreshConfirm:
      'Refresh "{name}" from its URL? This replaces your local changes with the latest version at that link.',
    refreshFailed: "Couldn't refresh from that URL.",
    cookieBannerText:
      "LoocalProject stores your language, projects and preferences in this browser's local storage — not in tracking cookies. See our",
    cookieBannerPolicyLink: "Cookie Policy",
    cookieBannerAccept: "Accept",
  },
  es: {
    appName: "LoocalProject",
    appTagline: "Cronogramas de proyectos pequeños, guardados en este navegador.",
    import: "Importar",
    newProject: "+ Nuevo proyecto",
    noProjectsYet: "Aún no hay proyectos. Crea uno para empezar tu primer cronograma.",
    tasksCount: "{count} tarea",
    tasksCountPlural: "{count} tareas",
    resourcesCount: "{count} recurso",
    resourcesCountPlural: "{count} recursos",
    noTasksYetShort: "Sin tareas",
    updated: "Actualizado {date}",
    rename: "Renombrar",
    duplicate: "Duplicar",
    export: "Exportar",
    exportXml: "Exportar XML",
    delete: "Eliminar",
    deleteProjectConfirm: '¿Eliminar "{name}"? Esta acción no se puede deshacer.',
    importInvalidFile:
      "Este archivo no parece ser una exportación válida de local-project ni un XML de MS Project.",
    newProjectTitle: "Nuevo proyecto",
    renameProjectTitle: "Renombrar proyecto",
    projectName: "Nombre del proyecto",
    defaultNewProjectName: "Nuevo proyecto",
    cancel: "Cancelar",
    create: "Crear",
    save: "Guardar",
    language: "Idioma",

    backToProjects: "← Proyectos",
    resourcesButton: "Recursos ({count})",
    exportMsProjectXml: "Exportar XML de MS Project",
    exportMsProjectXmlFailed: "No se pudo exportar este proyecto de vuelta a XML de MS Project.",
    addTask: "+ Tarea",
    addSubtask: "+ Subtarea",
    addMilestone: "+ Hito",
    indent: "Aumentar sangría",
    outdent: "Disminuir sangría",
    moveUp: "Subir",
    moveDown: "Bajar",
    day: "Día",
    week: "Semana",
    month: "Mes",
    noTasksYet: "Aún no hay tareas.",
    addFirstTask: "+ Añade tu primera tarea",
    deleteTaskConfirm: '¿Eliminar "{name}"{andSubtasks}?',
    andItsSubtasks: " y sus subtareas",
    projectNotFound: "Proyecto no encontrado.",

    colWbs: "EDT",
    colTaskName: "Nombre de tarea",
    colDuration: "Duración",
    colStart: "Inicio",
    colFinish: "Fin",
    colPreds: "Predec.",
    colResources: "Recursos",
    colProgress: "% Compl.",
    noResourcesYet: "Aún no hay recursos.",

    resourcesTitle: "Recursos",
    newResourceName: "Nombre del nuevo recurso",
    add: "Añadir",
    tasksSuffix: "tarea",
    tasksSuffixPlural: "tareas",
    removeResourceConfirm: '¿Quitar "{name}" de todas las tareas y eliminarlo?',
    resourceKindLabor: "Mano de obra",
    resourceKindMaterial: "Material",
    resourceKindEquipment: "Equipo",

    adjust: "Ajustar",
    adjustModalTitle: "Ajustar cronograma",
    adjustModalIntro:
      "Esto sobrescribe la duración y los predecesores de todas las tareas (no de los hitos ni de las tareas resumen).",
    adjustDaysLabel: "Días por tarea",
    adjustFixedTitle: "Días fijos por tarea",
    adjustFixedDesc:
      "Pone la duración de todas las tareas en {days} días y las encadena una tras otra automáticamente.",
    adjustLaborTitle: "Días según recursos de mano de obra",
    adjustLaborDesc:
      "Igual que el anterior, pero divide los {days} días entre el número de recursos de mano de obra asignados a cada tarea (mínimo 1 día). Las tareas sin ningún recurso de mano de obra se quedan en {days} días.",

    taskColor: "Color",
    defaultColor: "Color por defecto",

    hideImage: "Ocultar imagen",
    showImage: "Mostrar imagen",
    dropToImport: "Suelta para importar",

    openFromFolder: "Carpeta",
    openFromFolderHint: "Abrir un proyecto desde un archivo local",
    saveToFolder: "Guardar en carpeta",
    closeProject: "Cerrar",
    closeFileProjectConfirm: '¿Cerrar "{name}"? El archivo en disco no se verá afectado.',
    linkedToFile: "Vinculado a archivo",
    fileSaved: "guardado",
    fileSaving: "guardando…",
    fileErrorStatus: "no se pudo guardar",
    openFileFailed:
      "No se pudo abrir ese archivo — puede que no sea un archivo válido de local-project.",
    saveFileFailed: "No se pudo guardar el proyecto en ese archivo.",

    addFromUrl: "URL",
    addFromUrlTitle: "Añadir proyecto desde URL",
    addFromUrlHelp:
      "Descarga un JSON de local-project, un XML de MS Project o un BC3 desde una URL pública. Solo lectura: tus cambios aquí se quedan en local; usa Actualizar para traer la última versión. No funciona con enlaces de Google Drive, Dropbox o similares (bloquean este tipo de petición) — solo con URLs que sirvan el archivo directamente y permitan acceso de otro origen.",
    urlLabel: "URL del archivo",
    addFromUrlFailed:
      "No se pudo obtener esa URL. Asegúrate de que es pública, apunta directamente al archivo y permite peticiones de otro origen.",
    fromUrl: "Desde URL",
    refresh: "Actualizar",
    refreshConfirm:
      '¿Actualizar "{name}" desde su URL? Esto reemplaza tus cambios locales con la última versión de ese enlace.',
    refreshFailed: "No se pudo actualizar desde esa URL.",
    cookieBannerText:
      "LoocalProject guarda tu idioma, tus proyectos y tus preferencias en el almacenamiento local de este navegador, no en cookies de seguimiento. Consulta nuestra",
    cookieBannerPolicyLink: "Política de cookies",
    cookieBannerAccept: "Aceptar",
  },
};

export function translate(
  lang: Language,
  key: string,
  params?: Record<string, string | number>
): string {
  let str = translations[lang][key] ?? translations.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}

export function plural(
  lang: Language,
  count: number,
  singularKey: string,
  pluralKey: string
): string {
  return translate(lang, count === 1 ? singularKey : pluralKey, { count });
}
