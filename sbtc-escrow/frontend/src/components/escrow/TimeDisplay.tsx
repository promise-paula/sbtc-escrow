import { getRelativeTime } from "@/lib/mock-data";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";

interface TimeDisplayProps {
  date: Date;
  className?: string;
}

export function TimeDisplay({ date, className }: TimeDisplayProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className}>{getRelativeTime(date)}</span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{format(date, "MMM d, yyyy h:mm a")}</p>
      </TooltipContent>
    </Tooltip>
  );
}
