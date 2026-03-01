import { motion } from "framer-motion";
import { staggerChild } from "@/lib/animations";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface TestimonialCardProps {
  quote: string;
  name: string;
  role: string;
  company: string;
  initials: string;
  className?: string;
}

export function TestimonialCard({ quote, name, role, company, initials, className }: TestimonialCardProps) {
  return (
    <motion.div
      variants={staggerChild}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={cn(
        "glass-card rounded-xl p-6 noise-overlay transition-colors hover:border-primary/30",
        className
      )}
    >
      <div className="relative z-10 space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed italic">"{quote}"</p>
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">{role}, {company}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
