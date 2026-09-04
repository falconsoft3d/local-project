export const ROW_HEIGHT = 32;
export const HEADER_HEIGHT = 44;

export const COLUMNS = [
  { key: "wbs", labelKey: "colWbs", width: 44 },
  { key: "name", labelKey: "colTaskName", width: 220 },
  { key: "duration", labelKey: "colDuration", width: 74 },
  { key: "start", labelKey: "colStart", width: 108 },
  { key: "finish", labelKey: "colFinish", width: 108 },
  { key: "predecessors", labelKey: "colPreds", width: 76 },
  { key: "resources", labelKey: "colResources", width: 150 },
  { key: "progress", labelKey: "colProgress", width: 68 },
] as const;

export const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0);
