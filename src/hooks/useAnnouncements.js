import { useState, useEffect } from 'react';
import { streamBranchAnnouncements } from '../services/announcementService';
import { useBranch } from '../contexts/BranchContext';
import { useAuth } from '../contexts/AuthContext';

/**
 * Returns live announcements for the current branch filtered to `page`.
 * Returns an empty array (not loading) when no branch is selected.
 *
 * Announcements are readable only by AUTHENTICATED users (Firestore rules:
 * "any authenticated user reads"). PageAnnouncements is mounted on public
 * pages (languages / support / trainings), so if the stream opened for guests
 * every unauthenticated visitor would trigger a `permission-denied` console
 * error for a listener that can never succeed. We therefore skip the
 * subscription entirely until there is a signed-in user — guests already saw
 * nothing (the error path returned an empty list), so this is behaviour-neutral
 * for them and simply removes the noisy, doomed listener.
 */
export function useAnnouncements(page = null) {
  const { selectedBranchId } = useBranch();
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // No branch selected, or an unauthenticated guest → nothing to stream.
    if (!selectedBranchId || !user) {
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
  }, [selectedBranchId, user, page]);

  return { announcements, loading };
}
