import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Twitter, Github, MessageCircle, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { staggerContainer, staggerChild, fadeInUp } from "@/lib/animations";

const PRODUCT_LINKS = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Create Escrow", to: "/create" },
  { label: "Activity", to: "/activity" },
];

const RESOURCE_LINKS = [
  { label: "Documentation", href: "https://docs.stacks.co" },
  { label: "API Reference", href: "https://docs.stacks.co/stacks-101/api" },
  { label: "Status Page", href: "https://status.stacks.co" },
];

const SOCIAL_LINKS = [
  { icon: <Twitter className="h-4 w-4" />, href: "https://x.com/Stacks", label: "Twitter" },
  { icon: <Github className="h-4 w-4" />, href: "https://github.com/stacks-network", label: "GitHub" },
  { icon: <MessageCircle className="h-4 w-4" />, href: "https://discord.gg/stacks", label: "Discord" },
];

export function Footer() {
  const [email, setEmail] = useState("");

  const handleSubscribe = (e: FormEvent) => {
    e.preventDefault();
    toast.success("Thanks for subscribing!");
    setEmail("");
  };

  return (
    <footer className="border-t border-border bg-surface-1">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
        {/* Top grid */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
          className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4"
        >
          {/* Brand */}
          <motion.div variants={staggerChild}>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-semibold">sBTC Escrow</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Enterprise-grade escrow powered by Bitcoin.
            </p>
            <div className="flex gap-3">
              {SOCIAL_LINKS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </motion.div>

          {/* Product */}
          <motion.div variants={staggerChild}>
            <h4 className="text-sm font-semibold mb-3">Product</h4>
            <ul className="space-y-2">
              {PRODUCT_LINKS.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Resources */}
          <motion.div variants={staggerChild}>
            <h4 className="text-sm font-semibold mb-3">Resources</h4>
            <ul className="space-y-2">
              {RESOURCE_LINKS.map((l) => (
                <li key={l.label}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Newsletter */}
          <motion.div variants={staggerChild}>
            <h4 className="text-sm font-semibold mb-3">Stay Updated</h4>
            <p className="text-sm text-muted-foreground mb-3">
              Get the latest on sBTC Escrow features and updates.
            </p>
            <form onSubmit={handleSubscribe} className="flex gap-2">
              <Input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 text-sm"
                aria-label="Email address"
              />
              <button
                type="submit"
                className="shrink-0 inline-flex items-center gap-1 rounded-md btn-gradient px-3 h-9 text-xs font-semibold transition-shadow hover:glow-orange"
              >
                Subscribe <ArrowRight className="h-3 w-3" />
              </button>
            </form>
          </motion.div>
        </motion.div>

        <Separator className="my-8" />

        {/* Bottom bar */}
        <motion.div
          variants={fadeInUp}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground"
        >
          <span>© 2026 sBTC Escrow. All rights reserved.</span>
          <div className="flex gap-4">
            <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-primary transition-colors">Terms of Service</a>
          </div>
        </motion.div>
      </div>
    </footer>
  );
}
