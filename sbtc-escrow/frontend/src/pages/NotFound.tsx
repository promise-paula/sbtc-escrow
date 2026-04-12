import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/shared/Logo';
import { motion } from 'framer-motion';
import { cardVariants } from '@/lib/motion';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible" className="text-center space-y-4">
        <Logo size="xl" className="text-accent-warm mx-auto" />
        <p className="text-6xl font-bold text-muted-foreground/20 font-mono">404</p>
        <h1 className="text-lg font-semibold text-foreground">Page Not Found</h1>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">The page you're looking for doesn't exist or has been moved.</p>
        <Button onClick={() => navigate('/dashboard')} size="sm">Go to Dashboard</Button>
      </motion.div>
    </div>
  );
}
