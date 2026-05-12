import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeNeedle(value) {
  return String(value || "").trim().toLowerCase();
}

export function useEnterpriseDirectory() {
  const [state, setState] = useState({
    people: [],
    locations: [],
    gaps: [],
    orgNodes: [],
    personLocations: [],
    edges: [],
    loading: true,
    error: null,
    loadedAt: null,
  });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    const [peopleResult, locationsResult, gapsResult, orgResult, personLocationsResult, edgesResult] = await Promise.all([
      supabase.from("enterprise_directory_people_safe").select("*").order("display_name", { ascending: true }),
      supabase.from("enterprise_directory_locations").select("*").order("display_name", { ascending: true }),
      supabase.from("enterprise_directory_data_gaps").select("*").order("severity", { ascending: true }).order("gap_key", { ascending: true }),
      supabase.from("enterprise_directory_org_chart_nodes").select("*").order("sort_order", { ascending: true }).order("display_name", { ascending: true }),
      supabase.from("enterprise_directory_person_locations").select("*"),
      supabase.from("enterprise_directory_edges").select("*"),
    ]);

    const error = peopleResult.error || locationsResult.error || gapsResult.error || orgResult.error || personLocationsResult.error || edgesResult.error;
    if (error) {
      setState((current) => ({ ...current, loading: false, error }));
      return;
    }

    setState({
      people: peopleResult.data || [],
      locations: locationsResult.data || [],
      gaps: gapsResult.data || [],
      orgNodes: orgResult.data || [],
      personLocations: personLocationsResult.data || [],
      edges: edgesResult.data || [],
      loading: false,
      error: null,
      loadedAt: new Date(),
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return useMemo(() => {
    const locationsById = new Map(state.locations.map((location) => [location.id, location]));
    const rawPeopleById = new Map(state.people.map((person) => [person.id, person]));
    const personLocationsByPerson = new Map();
    const edgesByChild = new Map();
    const edgesByParent = new Map();

    asArray(state.personLocations).forEach((row) => {
      const rows = personLocationsByPerson.get(row.person_id) || [];
      rows.push(row);
      personLocationsByPerson.set(row.person_id, rows);
    });

    asArray(state.edges).forEach((edge) => {
      const childRows = edgesByChild.get(edge.child_person_id) || [];
      childRows.push(edge);
      edgesByChild.set(edge.child_person_id, childRows);
      const parentRows = edgesByParent.get(edge.parent_person_id) || [];
      parentRows.push(edge);
      edgesByParent.set(edge.parent_person_id, parentRows);
    });

    const enrichedPeople = state.people.map((person) => {
      const fallbackLocations = (personLocationsByPerson.get(person.id) || [])
        .map((row) => {
          const location = locationsById.get(row.location_id);
          if (!location) return null;
          return {
            id: location.id,
            location_key: location.location_key,
            display_name: location.display_name,
            city: location.city,
            state_code: location.state_code,
            responsibility_type: row.responsibility_type,
            title: row.title,
          };
        })
        .filter(Boolean);

      const fallbackManagers = (edgesByChild.get(person.id) || [])
        .map((edge) => {
          const manager = rawPeopleById.get(edge.parent_person_id);
          if (!manager) return null;
          return {
            id: manager.id,
            person_key: manager.person_key,
            display_name: manager.display_name,
            title: manager.title,
            is_primary: edge.is_primary,
          };
        })
        .filter(Boolean)
        .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) || a.display_name.localeCompare(b.display_name));

      return {
        ...person,
        managers: asArray(person.managers).length ? asArray(person.managers) : fallbackManagers,
        locations: asArray(person.locations).length ? asArray(person.locations) : fallbackLocations,
        direct_report_count: person.direct_report_count || (edgesByParent.get(person.id) || []).length,
      };
    });

    const peopleById = new Map(enrichedPeople.map((person) => [person.id, person]));
    const directReportsByManager = new Map();

    enrichedPeople.forEach((person) => {
      asArray(person.managers).forEach((manager) => {
        if (!manager?.id) return;
        const reports = directReportsByManager.get(manager.id) || [];
        reports.push(person);
        directReportsByManager.set(manager.id, reports);
      });
    });

    return {
      ...state,
      people: enrichedPeople,
      reload: load,
      peopleById,
      locationsById,
      directReportsByManager,
      searchPeople(filters = {}) {
        const query = normalizeNeedle(filters.query);
        const title = normalizeNeedle(filters.title);
        const location = normalizeNeedle(filters.location);
        const manager = normalizeNeedle(filters.manager);
        const status = normalizeNeedle(filters.status);

        return enrichedPeople.filter((person) => {
          const locationNames = asArray(person.locations).map((item) => item.display_name).join(" ");
          const managerNames = asArray(person.managers).map((item) => item.display_name).join(" ");
          const haystack = normalizeNeedle([
            person.display_name,
            person.title,
            person.email,
            person.work_phone,
            locationNames,
            managerNames,
            person.directory_status,
          ].join(" "));
          if (query && !haystack.includes(query)) return false;
          if (title && !normalizeNeedle(person.title).includes(title)) return false;
          if (location && !normalizeNeedle(locationNames).includes(location)) return false;
          if (manager && !normalizeNeedle(managerNames).includes(manager)) return false;
          if (status && normalizeNeedle(person.directory_status) !== status) return false;
          return true;
        });
      },
    };
  }, [state, load]);
}

export default useEnterpriseDirectory;
