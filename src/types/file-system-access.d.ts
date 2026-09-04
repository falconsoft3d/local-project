export {};

/** Minimal File System Access API surface (Chromium browsers). Not yet part of
 * TypeScript's bundled DOM lib, so we declare just what this app uses. */
declare global {
  interface FileSystemWritableFileStream {
    write(data: string | BufferSource | Blob): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }

  interface FileSystemFileHandle {
    readonly kind: "file";
    readonly name: string;
    getFile(): Promise<File>;
    createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
    isSameEntry(other: FileSystemFileHandle): Promise<boolean>;
  }

  interface FilePickerAcceptType {
    description?: string;
    accept: Record<string, string[]>;
  }

  interface OpenFilePickerOptions {
    types?: FilePickerAcceptType[];
    excludeAcceptAllOption?: boolean;
    multiple?: boolean;
  }

  interface SaveFilePickerOptions {
    types?: FilePickerAcceptType[];
    excludeAcceptAllOption?: boolean;
    suggestedName?: string;
  }

  interface Window {
    showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  }
}
