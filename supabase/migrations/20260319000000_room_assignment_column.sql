-- Add room_assignment column to gingr_reservations
-- Populated by assignRoomsServerSide() in gingr-sync after every sync.
-- Contains the assigned room name (e.g. "Luxury Suite 2", "Executive Room 4")
-- NULL for non-boarding and day boarding reservations.

ALTER TABLE gingr_reservations ADD COLUMN IF NOT EXISTS room_assignment TEXT;

-- Index for efficient room-based queries (room cleaning, occupancy)
CREATE INDEX IF NOT EXISTS idx_gingr_res_room ON gingr_reservations(location_id, room_assignment)
  WHERE room_assignment IS NOT NULL;
