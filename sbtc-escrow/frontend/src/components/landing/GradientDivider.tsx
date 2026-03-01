import { cn } from "@/lib/utils";

interface GradientDividerProps {
  variant?: "orange" | "purple" | "blue";
  className?: string;
}

export function GradientDivider({ variant = "orange", className }: GradientDividerProps) {
  return (
    <div
      className={cn(
        "gradient-divider",
        variant === "orange" && "gradient-divider-orange",
        variant === "purple" && "gradient-divider-purple",
        variant === "blue" && "gradient-divider-blue",
        className
      )}
      aria-hidden
    />
  );
}
