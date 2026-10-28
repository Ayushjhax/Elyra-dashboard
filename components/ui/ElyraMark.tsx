import Image from "next/image";
import { cn } from "@/lib/utils";

/** The Elyra logo — always the light version, `public/elyra-public-avatar.png`. */
export function ElyraMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/elyra-public-avatar.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn("shrink-0 rounded-card object-cover", className)}
    />
  );
}
