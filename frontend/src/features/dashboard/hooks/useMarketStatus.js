import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api/client';

function mapStatus(market) {
  if (!market) return { open: false, label: 'Bilinmiyor', autoOk: false };
  switch (market.status) {
    case 'OPEN':       return { open: true,  label: 'Açık',      autoOk: true  };
    case 'PRE-MARKET': return { open: false, label: 'Ön Seans',  autoOk: false };
    case 'CLOSING':    return { open: false, label: 'Kapanış',   autoOk: true  };
    case 'CLOSED':     return { open: false, label: market.message?.includes('Yarım') ? 'Yarım Gün Bitti' : 'Kapalı', autoOk: false };
    default:           return { open: false, label: 'Kapalı',    autoOk: false };
  }
}

export function useMarketStatus() {
  const { data } = useQuery({
    queryKey: ['ticker'],
    queryFn: api.ticker,
    refetchInterval: 60_000,
    staleTime: 55_000,
  });
  return mapStatus(data?.market);
}
