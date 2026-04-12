import { useEffect, useRef } from 'react';
import { useDisputedEscrows } from '@/hooks/use-admin';
import { toast } from 'sonner';

export function useDisputeCount() {
  const { data: disputed } = useDisputedEscrows();
  const count = disputed?.length ?? 0;
  const prevCount = useRef(count);

  useEffect(() => {
    if (count > prevCount.current && prevCount.current !== 0) {
      const newest = disputed?.[disputed.length - 1];
      toast.warning('New dispute filed', {
        description: newest ? `Escrow #${newest.id} requires attention` : 'A new dispute requires attention',
      });
    }
    prevCount.current = count;
  }, [count, disputed]);

  return { count };
}
