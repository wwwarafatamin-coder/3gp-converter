import type { Plugin } from "@capacitor/core";

export interface NativePickedFile {
  uri: string;
  name: string;
  size: number;
}

export interface NativeConvertResult {
  path: string;
  name: string;
  size: number;
}

export interface NativeFfmpegPlugin extends Plugin {
  isAvailable(): Promise<{ available: boolean }>;
  pickVideo(): Promise<NativePickedFile>;
  convert(options: {
    uri: string;
    fileName: string;
    width: number;
    height: number;
    fps: number;
    videoBitrate: string;
    audioRate: number;
    audioBitrate: string;
  }): Promise<NativeConvertResult>;
  exportToDownloads(options: { path: string }): Promise<{ uri: string; folder: string }>;
  addListener(
    event: "progress",
    cb: (data: { ratio: number; speed: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    event: "log",
    cb: (data: { line: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

export const NativeFfmpeg: NativeFfmpegPlugin;
