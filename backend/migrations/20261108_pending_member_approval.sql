-- New public registrations must wait for admin approval.
-- This changes only the column default; existing accounts keep their current is_active value.
ALTER TABLE users
    MODIFY COLUMN is_active BOOLEAN NOT NULL DEFAULT FALSE;
