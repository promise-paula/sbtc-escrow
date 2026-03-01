import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { PageTransition } from "@/components/layout/PageTransition";
import { useDocumentHead } from "@/hooks/use-document-head";
import { Shield, Home, LayoutDashboard } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  useDocumentHead({ title: "Page Not Found | sBTC Escrow", description: "The page you're looking for doesn't exist." });

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <PageTransition>
      <div className="gradient-mesh min-h-[80vh] flex items-center justify-center p-4">
        <div className="glass-card rounded-2xl p-8 sm:p-12 max-w-lg w-full text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-6xl font-bold font-mono text-primary mb-3"
            >
              404
            </motion.h1>
            <h2 className="text-xl font-semibold mb-2">Page Not Found</h2>
            <p className="text-sm text-muted-foreground">
              The page you're looking for doesn't exist or has been moved.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link to="/">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 rounded-xl btn-gradient px-6 py-3 text-sm font-semibold"
              >
                <Home className="h-4 w-4" /> Back to Home
              </motion.button>
            </Link>
            <Link to="/dashboard">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface-1 px-6 py-3 text-sm font-medium hover:bg-surface-2 transition-colors"
              >
                <LayoutDashboard className="h-4 w-4" /> Go to Dashboard
              </motion.button>
            </Link>
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

export default NotFound;
