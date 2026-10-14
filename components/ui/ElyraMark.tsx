import Image from "next/image";
import { cn } from "@/lib/utils";

export function ElyraMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/images/elyra-intelligence.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn("shrink-0 rounded-card object-cover", className)}
    />
  );
}
