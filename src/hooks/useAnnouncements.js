import { useState, useEffect } from 'react';
import { streamBranchAnnouncements } from '../services/announcementService';
import { useBranch } from '../contexts/BranchContext';

/**
 * Returns live announcements for the current branch filtered to `page`.
 * Returns an empty array (not loading) when no branch is selected.
 */
export function useAnnouncements(page = null) {
  const { selectedBranchId } = useBranch();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedBranchId) {
      setAnnouncements([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsub = streamBranchAnnouncements({
      branchId: selectedBranchId,
      page,
      onData:  (data) => { setAnnouncements(data); setLoading(false); },
      onError: ()     => { setAnnouncements([]);   setLoading(false); },
    });

    return unsub;
  }, [selectedBranchId, page]);

  return { announcements, loading };
}
