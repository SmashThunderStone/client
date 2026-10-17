import { useSyncExternalStore } from 'react';

const progressBySrc = new Map<string, number>();
const abortBySrc = new Map<string, AbortController>();
const srcByFile = new WeakMap<File, string>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function bindCastImageFile(file: File, src: string) {
  srcByFile.set(file, src);
}

export function castImageSrcForFile(file: File): string | undefined {
  return srcByFile.get(file);
}

export function publishCastImageProgress(src: string, percent: number | null) {
  if (percent === null) {
    progressBySrc.delete(src);
  } else {
    progressBySrc.set(src, percent);
  }
  emit();
}

export function registerCastImageAbort(
  src: string,
  controller: AbortController,
) {
  abortBySrc.set(src, controller);
}

export function abortCastImageUpload(src: string) {
  abortBySrc.get(src)?.abort();
  abortBySrc.delete(src);
  progressBySrc.delete(src);
  emit();
}

export function useCastImageUploadProgress(src: string): number | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => progressBySrc.get(src) ?? null,
    () => null,
  );
}
