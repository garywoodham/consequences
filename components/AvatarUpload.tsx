"use client";

import { useId, useState } from "react";
import { Camera, Upload } from "lucide-react";
import { resizeImageToAvatar } from "@/lib/image-utils";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "./PlayerAvatar";

type AvatarUploadProps = {
  name: string;
  value?: string;
  onChange: (url: string | undefined) => void;
  className?: string;
};

export function AvatarUpload({ name, value, onChange, className }: AvatarUploadProps) {
  const galleryId = useId();
  const cameraId = useId();
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const preview = localPreview ?? value;

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const resized = await resizeImageToAvatar(file);
      const formData = new FormData();
      formData.append("file", resized, "avatar.jpg");

      const response = await fetch("/api/upload-avatar", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Upload failed");
      }

      const data = await response.json();
      setLocalPreview(data.url);
      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const pickerClass =
    "inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 text-sm font-medium text-white transition hover:bg-white/20";

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <PlayerAvatar name={name || "Player"} avatarUrl={preview} size="lg" />
      <div className="flex gap-2">
        <label htmlFor={galleryId} className={cn(pickerClass, uploading && "pointer-events-none opacity-50")}>
          <Upload className="h-4 w-4" />
          {uploading ? "Uploading..." : "Upload photo"}
        </label>
        <label htmlFor={cameraId} className={cn(pickerClass, uploading && "pointer-events-none opacity-50")}>
          <Camera className="h-4 w-4" />
          Camera
        </label>
      </div>
      {preview && (
        <button
          type="button"
          className="text-xs text-white/60 underline"
          onClick={() => {
            setLocalPreview(undefined);
            onChange(undefined);
          }}
        >
          Remove photo
        </button>
      )}
      {!preview && (
        <p className="text-center text-xs text-white/50">Optional — initials shown if skipped</p>
      )}
      {error && <p className="text-center text-xs text-red-300">{error}</p>}
      <input
        id={galleryId}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <input
        id={cameraId}
        type="file"
        accept="image/*"
        capture="user"
        className="sr-only"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
