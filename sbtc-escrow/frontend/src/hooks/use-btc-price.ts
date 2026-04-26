import { useQuery } from '@tanstack/react-query';

async function fetchBtcPrice(): Promise<number> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
    );
    if (!res.ok) return 0;
    const data = await res.json();
    return data.bitcoin?.usd ?? 0;
  } catch {
    return 0;
  }
}

export function useBtcPrice() {
  return useQuery({
    queryKey: ['btc-price'],
    queryFn: fetchBtcPrice,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
