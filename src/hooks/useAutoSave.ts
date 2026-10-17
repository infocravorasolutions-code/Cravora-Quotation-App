import { useEffect, useRef } from 'react';
import { useQuotationStore } from '../store/quotationStore';

export function useAutoSave(interval: number = 30000) { // 30 seconds default
  const { saveDraft, clientInfo, modules, tax, isDraft, status } = useQuotationStore();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string | null>(null);

  useEffect(() => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Only auto-save if there's meaningful data and it's a draft
    const hasData = clientInfo.clientName || clientInfo.clientEmail || modules.length > 0;
    
    const locked = ['sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted'].includes(status);
    if (hasData && isDraft && !locked) {
      timeoutRef.current = setTimeout(() => {
        saveDraft().catch(() => undefined);
        lastSavedRef.current = new Date().toISOString();
      }, interval);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [clientInfo, modules, tax, isDraft, status, saveDraft, interval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    lastSaved: lastSavedRef.current,
  };
}
