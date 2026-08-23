import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { recordRouteVisit } from '@/lib/aiContext';

export function HelpAiRouteTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    recordRouteVisit(pathname);
  }, [pathname]);
  return null;
}
