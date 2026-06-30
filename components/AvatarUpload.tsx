"use client";

import { useRef, useState } from "react";
import { Camera, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const inputRef = useRef<HTMLInputElement>(null);
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
        const data = await response.json();
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

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <PlayerAvatar name={name || "Player"} avatarUrl={preview} size="lg" />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {uploading ? "Uploading..." : "Upload photo"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={uploading}
          onClick={() => {
            if (inputRef.current) {
              inputRef.current.setAttribute("capture", "user");
              inputRef.current.click();
            }
          }}
        >
          <Camera className="h-4 w-4" />
          Camera
        </Button>
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
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
