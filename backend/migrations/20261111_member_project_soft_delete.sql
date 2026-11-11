-- Keep deleted projects counted toward their daily creation limit.
ALTER TABLE member_projects
    ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;
