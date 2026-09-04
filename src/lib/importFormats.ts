import { isMsProjectXml, parseMsProjectXml } from "./msproject";
import { isBc3, parseBc3 } from "./bc3";
import { parseProjectFile } from "./projectFile";
import type { Project } from "./types";

/** Decodes a file's raw bytes into text, picking the right charset first. BC3 files are
 * Windows-1252/Latin-1, not UTF-8 — sniff the (pure-ASCII) header before decoding the full
 * buffer, so accented text isn't mangled. Shared by file-input, drag-and-drop, and URL import. */
export async function decodeImportBuffer(buffer: ArrayBuffer): Promise<string> {
  const head = new TextDecoder("ascii").decode(buffer.slice(0, 400));
  const isBc3Header = head.includes("~V|") && head.toUpperCase().includes("FIEBDC");
  return new TextDecoder(isBc3Header ? "windows-1252" : "utf-8").decode(buffer);
}

/** Dispatches decoded text to the right format parser (local-project JSON, MS Project XML,
 * or BC3) and returns a Project. Throws if the content doesn't match any known format. */
export function parseImportedContent(content: string, fileNameHint: string): Project {
  const trimmed = content.trim();
  if (trimmed.startsWith("<") || isMsProjectXml(trimmed)) {
    return parseMsProjectXml(content);
  }
  if (isBc3(trimmed)) {
    return parseBc3(content, fileNameHint);
  }
  return parseProjectFile(content);
}
