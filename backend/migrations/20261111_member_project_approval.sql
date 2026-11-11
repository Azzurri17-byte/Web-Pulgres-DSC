-- New member projects must wait for admin approval.
ALTER TABLE member_projects
    MODIFY COLUMN status ENUM('draft', 'pending', 'published', 'archived') NOT NULL DEFAULT 'pending';

-- Treat projects submitted before moderation was added as awaiting review.
UPDATE member_projects SET status = 'pending' WHERE status = 'draft';
