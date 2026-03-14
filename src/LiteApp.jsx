// © 2026 K9 Operations LLC. All Rights Reserved.
// Proprietary and Confidential. Unauthorized copying, modification,
// distribution, or use of this software is strictly prohibited.

// ─── K9 Operations Lite ─────────────────────────────────────────────────────
// Bolt-on modules for Gingr: Customer Lifecycle, Operations Hub, Photos.
// This app reads from Gingr's API using credentials stored per-location.

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { useAuth } from "./AuthProvider";
import { supabase } from "./supabaseClient";