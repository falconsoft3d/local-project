export const ROW_HEIGHT = 32;
export const HEADER_HEIGHT = 44;

export const COLUMNS = [
  { key: "code", labelKey: "colCode", width: 58 },
  { key: "name", labelKey: "colTaskName", width: 230 },
  { key: "duration", labelKey: "colDuration", width: 70 },
  { key: "start", labelKey: "colStart", width: 104 },
  { key: "finish", labelKey: "colFinish", width: 104 },
  { key: "predecessors", labelKey: "colPreds", width: 112 },
  { key: "resources", labelKey: "colResources", width: 96 },
  { key: "certified", labelKey: "colCertified", width: 54 },
  { key: "progress", labelKey: "colPhysical", width: 54 },
  { key: "float", labelKey: "colFloat", width: 56 },
] as const;

/** Colour of each resource type (chips in the Gantt table). */
export const RESOURCE_KIND_COLORS = {
  labor: "#2563eb",
  material: "#d97706",
  equipment: "#059669",
  subcontract: "#7c3aed",
} as const;

export const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0);
