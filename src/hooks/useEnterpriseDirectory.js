import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  DIRECTORY_PHOTO_BUCKET,
  asArray,
  buildDirectReportsByManager,
  buildEdgesByChild,
  buildEdgesByParent,
  buildPersonKey,
  getManagerValidation,
  searchPeople,
} from "../kol/enterprise/companyDirectoryModel";

function normalizeOptionalText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeLocationKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function splitName(displayName) {
  const parts = String(displayName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: null, last_name: null };
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

function fileExtension(file) {
  const nameExt = String(file?.name || "").split(".").pop()?.toLowerCase();
  if (nameExt && /^[a-z0-9]{2,5}$/.test(nameExt)) return nameExt === "jpg" ? "jpeg" : nameExt;
  if (file?.type === "image/png") return "png";
  if (file?.type === "image/webp") return "webp";
  return "jpeg";
}

function assertImageFile(file) {
  if (!file) return;
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(file.type)) {
    throw new Error("Profile photos must be JPG, PNG, or WebP.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Profile photos must be 5 MB or smaller.");
  }
}

async function signedPhotoUrl(person) {
  if (person.profile_photo_bucket && person.profile_photo_path) {
    const { data, error } = await supabase.storage
      .from(person.profile_photo_bucket)
      .createSignedUrl(person.profile_photo_path, 60 * 60);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return person.profile_photo_url || "";
}

function normalizePhotoPathSegment(value) {
  return String(value || "person")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "person";
}

export function useEnterpriseDirectory() {
  const [state, setState] = useState({
    people: [],
    locations: [],
    gaps: [],
    personLocations: [],
    edges: [],
    loading: true,
    saving: false,
    error: null,
    loadedAt: null,
  });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    const [peopleResult, locationsResult, gapsResult, personLocationsResult, edgesResult] = await Promise.all([
      supabase.from("enterprise_directory_people_safe").select("*").order("display_name", { ascending: true }),
      supabase.from("enterprise_directory_locations").select("*").order("display_name", { ascending: true }),
      supabase.from("enterprise_directory_data_gaps").select("*").order("severity", { ascending: true }).order("gap_key", { ascending: true }),
      supabase.from("enterprise_directory_person_locations").select("*"),
      supabase.from("enterprise_directory_edges").select("*"),
    ]);

    const error = peopleResult.error || locationsResult.error || gapsResult.error || personLocationsResult.error || edgesResult.error;
    if (error) {
      setState((current) => ({ ...current, loading: false, error }));
      return;
    }

    const peopleWithPhotos = await Promise.all((peopleResult.data || []).map(async (person) => ({
      ...person,
      photo_display_url: await signedPhotoUrl(person),
    })));

    setState({
      people: peopleWithPhotos,
      locations: locationsResult.data || [],
      gaps: gapsResult.data || [],
      personLocations: personLocationsResult.data || [],
      edges: edgesResult.data || [],
      loading: false,
      saving: false,
      error: null,
      loadedAt: new Date(),
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const uploadProfilePhoto = useCallback(async (person, file) => {
    if (!file) return person;
    assertImageFile(file);
    const ext = fileExtension(file);
    const path = `${person.id}/${Date.now()}-${normalizePhotoPathSegment(person.display_name)}.${ext}`;
    const bucket = DIRECTORY_PHOTO_BUCKET;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase
      .from("enterprise_directory_people")
      .update({
        profile_photo_bucket: bucket,
        profile_photo_path: path,
        profile_photo_url: null,
      })
      .eq("id", person.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }, []);

  const setPrimaryManager = useCallback(async ({ childId, managerId }) => {
    const { data, error } = await supabase.rpc("enterprise_directory_set_primary_manager", {
      p_child_person_id: childId,
      p_parent_person_id: managerId || null,
    });
    if (error) throw error;
    if (data && data.success === false) throw new Error(data.error || "Manager update failed.");
    return data;
  }, []);

  const setDirectoryLocation = useCallback(async ({ personId, locationId, title }) => {
    const { error: deleteError } = await supabase
      .from("enterprise_directory_person_locations")
      .delete()
      .eq("person_id", personId)
      .eq("responsibility_type", "directory_location")
      .eq("source", "manual");
    if (deleteError) throw deleteError;
    if (!locationId) return;

    const { error: insertError } = await supabase
      .from("enterprise_directory_person_locations")
      .insert({
        person_id: personId,
        location_id: locationId,
        responsibility_type: "directory_location",
        title: normalizeOptionalText(title),
        source: "manual",
        source_metadata: { maintained_in: "company_directory" },
      });
    if (insertError) throw insertError;
  }, []);

  const setLocationAssignment = useCallback(async ({ locationId, responsibilityType, personId, title }) => {
    const { error: deleteError } = await supabase
      .from("enterprise_directory_person_locations")
      .delete()
      .eq("location_id", locationId)
      .eq("responsibility_type", responsibilityType);
    if (deleteError) throw deleteError;
    if (!personId) return;

    const { error: insertError } = await supabase
      .from("enterprise_directory_person_locations")
      .insert({
        person_id: personId,
        location_id: locationId,
        responsibility_type: responsibilityType,
        title: normalizeOptionalText(title),
        source: "manual",
        source_metadata: { maintained_in: "company_directory_resorts" },
      });
    if (insertError) throw insertError;
  }, []);

  const saveLocation = useCallback(async ({ locationId, values }) => {
    setState((current) => ({ ...current, saving: true, error: null }));
    try {
      const displayName = normalizeOptionalText(values.display_name);
      if (!displayName) throw new Error("Resort name is required.");
      const locationKey = normalizeLocationKey(values.location_key);
      if (!locationKey) throw new Error("Location ID is required.");

      const { data: saved, error } = await supabase
        .from("enterprise_directory_locations")
        .update({
          location_key: locationKey,
          source_location_name: displayName,
          display_name: displayName,
          state_code: normalizeOptionalText(values.state_code)?.toUpperCase() || null,
          address_line1: normalizeOptionalText(values.address_line1),
          address_line2: normalizeOptionalText(values.address_line2),
          city: normalizeOptionalText(values.city),
          postal_code: normalizeOptionalText(values.postal_code),
          source_metadata: { maintained_in: "company_directory_resorts" },
        })
        .eq("id", locationId)
        .select("*")
        .single();
      if (error) throw error;

      await setLocationAssignment({
        locationId,
        responsibilityType: "general_manager",
        personId: values.general_manager_id || null,
        title: "General Manager",
      });
      await setLocationAssignment({
        locationId,
        responsibilityType: "regional_manager",
        personId: values.regional_manager_id || null,
        title: "Regional Manager",
      });

      await load();
      return saved;
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
      throw error;
    }
  }, [load, setLocationAssignment]);

  const savePerson = useCallback(async ({ personId = null, values, photoFile = null }) => {
    setState((current) => ({ ...current, saving: true, error: null }));
    try {
      const displayName = normalizeOptionalText(values.display_name);
      if (!displayName) throw new Error("Name is required.");

      const nameParts = splitName(displayName);
      const payload = {
        ...nameParts,
        display_name: displayName,
        email: normalizeOptionalText(values.email)?.toLowerCase() || null,
        work_phone: normalizeOptionalText(values.work_phone),
        title: normalizeOptionalText(values.title),
        department: normalizeOptionalText(values.department),
        directory_status: values.directory_status || "active",
        person_type: values.person_type || "person",
        source_systems: ["manual"],
        source_metadata: { maintained_in: "company_directory" },
      };
      if (values.org_chart_display_role) {
        payload.org_chart_display_role = values.org_chart_display_role;
        payload.org_chart_partner_person_id = values.org_chart_partner_person_id || null;
        payload.org_chart_branch_layout = values.org_chart_branch_layout || "standard_tree";
      }

      let saved;
      if (personId) {
        const { data, error } = await supabase
          .from("enterprise_directory_people")
          .update(payload)
          .eq("id", personId)
          .select("*")
          .single();
        if (error) throw error;
        saved = data;
      } else {
        const personKey = buildPersonKey(displayName, state.people.map((person) => person.person_key));
        const { data, error } = await supabase
          .from("enterprise_directory_people")
          .insert({ ...payload, person_key: personKey })
          .select("*")
          .single();
        if (error) throw error;
        saved = data;
      }

      if (photoFile) {
        saved = await uploadProfilePhoto(saved, photoFile);
      }

      await setDirectoryLocation({
        personId: saved.id,
        locationId: values.location_id || null,
        title: payload.title,
      });

      await setPrimaryManager({
        childId: saved.id,
        managerId: values.manager_id || null,
      });

      await load();
      return saved;
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
      throw error;
    }
  }, [load, setDirectoryLocation, setPrimaryManager, state.people, uploadProfilePhoto]);

  const updateManager = useCallback(async ({ childId, managerId }) => {
    setState((current) => ({ ...current, saving: true, error: null }));
    try {
      await setPrimaryManager({ childId, managerId });
      await load();
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error }));
      throw error;
    }
  }, [load, setPrimaryManager]);

  return useMemo(() => {
    const locationsById = new Map(state.locations.map((location) => [location.id, location]));
    const rawPeopleById = new Map(state.people.map((person) => [person.id, person]));
    const personLocationsByPerson = new Map();
    const edgesByChild = buildEdgesByChild(state.edges);
    const edgesByParent = buildEdgesByParent(state.edges);

    asArray(state.personLocations).forEach((row) => {
      const rows = personLocationsByPerson.get(row.person_id) || [];
      rows.push(row);
      personLocationsByPerson.set(row.person_id, rows);
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
    const directReportsByManager = buildDirectReportsByManager(enrichedPeople, state.edges);

    return {
      ...state,
      people: enrichedPeople,
      reload: load,
      savePerson,
      saveLocation,
      updateManager,
      peopleById,
      locationsById,
      directReportsByManager,
      getManagerValidation(args) {
        return getManagerValidation({ people: enrichedPeople, edges: state.edges, ...args });
      },
      searchPeople(filters = {}) {
        return searchPeople(enrichedPeople, filters);
      },
    };
  }, [load, saveLocation, savePerson, state, updateManager]);
}

export default useEnterpriseDirectory;
