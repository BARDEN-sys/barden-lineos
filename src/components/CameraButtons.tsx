"use client";

import { useRef } from "react";

/**
 * "Take photo" opens the phone's rear camera directly (capture="environment");
 * "Choose photo" opens the photo library / files. On a desktop both open a file picker.
 */
export function CameraButtons({
  onFiles,
  multiple = false,
  takeLabel = "Take photo",
  chooseLabel = "Choose photo",
  disabled,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  takeLabel?: string;
  chooseLabel?: string;
  disabled?: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (files.length) onFiles(files);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handle} />
      <input ref={pickRef} type="file" accept="image/*" multiple={multiple} className="hidden" onChange={handle} />
      <button className="btn-primary" disabled={disabled} onClick={() => cameraRef.current?.click()}>
        📷 {takeLabel}
      </button>
      <button className="btn-ghost" disabled={disabled} onClick={() => pickRef.current?.click()}>
        {chooseLabel}
      </button>
    </div>
  );
}
