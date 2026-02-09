import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';

// Supabase-powered data hook
// Reads/writes location data as a JSON blob in the "locations" table
// Includes real-time subscription so all users see updates instantly

export function useData(profile) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false); // Track load failures to prevent DEMO overwrite
  const [isEmpty, setIsEmpty] = useState(false); // True ONLY when Supabase confirms no data exists
  const locationId = profile?.location_id;
  const saveTimeoutRef = useRef(null);

  // Load data from Supabase
  useEffect(() => {
    if (!locationId) { setLoading(false); return; }

    const load = async () => {
      setLoadError(false);
      const { data: row, error } = await supabase
        .from('locations')
        .select('data')
        .eq('id', locationId)
        .single();

      if (error) {
        console.error('Failed to load data:', error);
        setLoadError(true); // Mark as error — DO NOT allow DEMO overwrite
        setLoading(false);
        return;
      }

      if (row?.data && Object.keys(row.data).length > 0) {
        setData(row.data);
        setIsEmpty(false);
      } else {
        // Supabase confirmed: location exists but has no data (truly empty)
        setData(null);
        setIsEmpty(true);
      }
      setLoading(false);
    };

    load();

    // Real-time subscription: when another user saves, we get the update
    const channel = supabase
      .channel('location-changes')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'locations',
        filter: `id=eq.${locationId}`,
      }, (payload) => {
        // Only update if the change came from someone else
        if (payload.new?.data) {
          setData(payload.new.data);
          setIsEmpty(false);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [locationId]);

  // Save data to Supabase (debounced to avoid hammering the DB)
  const save = useCallback(async (newData) => {
    setData(newData); // Update UI immediately
    setIsEmpty(false); // No longer empty after save

    if (!locationId) return;

    // Debounce: wait 300ms after last save call before writing to DB
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const { error } = await supabase
        .from('locations')
        .update({ data: newData })
        .eq('id', locationId);

      if (error) console.error('Failed to save:', error);
    }, 300);
  }, [locationId]);

  return { data, loading, save, locationId, loadError, isEmpty };
}
