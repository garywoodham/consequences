/* eslint-disable @next/next/no-img-element -- avatars may be data URLs or external blob URLs */
import { getInitials } from "@/lib/image-utils";
import { cn } from "@/lib/utils";

type PlayerAvatarProps = {
  name: string;
  avatarUrl?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-20 w-20 text-xl",
};

export function PlayerAvatar({ name, avatarUrl, size = "md", className }: PlayerAvatarProps) {
  const initials = getInitials(name || "?");

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={cn("rounded-full object-cover ring-2 ring-white/20", sizeClasses[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 font-semibold text-white ring-2 ring-white/20",
        sizeClasses[size],
        className
      )}
      aria-label={name}
    >
      {initials || "?"}
    </div>
  );
}
