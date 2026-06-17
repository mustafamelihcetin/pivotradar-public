/**
 * useGuestLimit — Guest kullanıcı için günlük analiz limitini yönetir.
 * DashboardPage'den ayrıştırıldı: modal state ve kontrol burada.
 */
import { useState, useCallback } from 'react';
import { getGuestAnalysisCount } from '../utils/dashboardHelpers';

const GUEST_DAILY_LIMIT = 3;

export function useGuestLimit(actualIsGuest) {
  const [showModal, setShowModal] = useState(false);

  const checkLimit = useCallback(() => {
    if (!actualIsGuest) return false;
    if (getGuestAnalysisCount() >= GUEST_DAILY_LIMIT) {
      setShowModal(true);
      return true;
    }
    return false;
  }, [actualIsGuest]);

  return { showModal, closeModal: () => setShowModal(false), checkLimit };
}
