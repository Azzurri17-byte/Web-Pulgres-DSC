-- =========================================
-- 1. USERS
-- Menyimpan akun admin dan anggota
-- =========================================

CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    username VARCHAR(50) NOT NULL UNIQUE,
    nim VARCHAR(30) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,

    role ENUM('admin', 'member') NOT NULL DEFAULT 'member',

    is_active BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;


-- =========================================
-- 2. USER PROFILES
-- Informasi profil anggota untuk leaderboard
-- =========================================

CREATE TABLE user_profiles (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    user_id BIGINT UNSIGNED NOT NULL UNIQUE,

    display_name VARCHAR(100) NOT NULL,
    bio TEXT,
    avatar_url VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_profile_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;


-- =========================================
-- 3. TASKS
-- Admin membuat dan mengelola tugas
-- =========================================

CREATE TABLE tasks (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,

    max_points INT UNSIGNED NOT NULL DEFAULT 10,

    deadline DATETIME,

    status ENUM('draft', 'published', 'archived')
        NOT NULL DEFAULT 'draft',

    created_by BIGINT UNSIGNED NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_task_admin
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    INDEX idx_task_status (status),
    INDEX idx_task_deadline (deadline)
) ENGINE=InnoDB;


-- =========================================
-- 4. SUBMISSIONS
-- Menyimpan pengumpulan tugas anggota
-- =========================================

CREATE TABLE submissions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    task_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,

    submission_content TEXT,
    attachment_url VARCHAR(500),

    status ENUM('pending', 'approved', 'revision')
        NOT NULL DEFAULT 'pending',

    feedback TEXT,

    reviewed_by BIGINT UNSIGNED,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    -- Satu anggota memiliki satu submission aktif
    -- untuk setiap tugas.
    CONSTRAINT uq_task_user
        UNIQUE (task_id, user_id),

    CONSTRAINT fk_submission_task
        FOREIGN KEY (task_id)
        REFERENCES tasks(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_submission_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_submission_reviewer
        FOREIGN KEY (reviewed_by)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    INDEX idx_submission_status (status),
    INDEX idx_submission_user (user_id)
) ENGINE=InnoDB;


-- =========================================
-- 5. POINT TRANSACTIONS
-- Mencatat seluruh perubahan poin anggota
-- =========================================

CREATE TABLE point_transactions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    user_id BIGINT UNSIGNED NOT NULL,

    submission_id BIGINT UNSIGNED UNIQUE,

    transaction_type ENUM('award', 'adjustment')
        NOT NULL,

    points_delta INT NOT NULL,

    description VARCHAR(255),

    created_by BIGINT UNSIGNED NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_points_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_points_submission
        FOREIGN KEY (submission_id)
        REFERENCES submissions(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_points_admin
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    INDEX idx_points_user (user_id),
    INDEX idx_points_created (created_at)
) ENGINE=InnoDB;

-- =========================================
-- 6. LEARNING_MATERIAL
-- Tempat menyimpan modul pembelajaran
-- =========================================


CREATE TABLE learning_materials (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    title VARCHAR(150) NOT NULL,
    description TEXT,

    url_module varchar(255) NULL,

    file_name VARCHAR(255) NULL,
    file_path VARCHAR(500) NULL,
    file_size BIGINT UNSIGNED NULL,

    uploaded_by BIGINT UNSIGNED NOT NULL,

    status ENUM(
        'draft',
        'published',
        'archived'
    ) NOT NULL DEFAULT 'published',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_material_uploader
        FOREIGN KEY (uploaded_by)
        REFERENCES users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    INDEX idx_material_status (status),
    INDEX idx_material_created (created_at)
) ENGINE=InnoDB;


-- =========================================
-- 7. MEMBER_PROJECT
-- Tempat menyimpan hasil project member
-- =========================================

CREATE TABLE member_projects (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    user_id BIGINT UNSIGNED NOT NULL,

    title VARCHAR(150) NOT NULL,
    description TEXT,

    project_url VARCHAR(500) DEFAULT NULL,
    repository_url VARCHAR(500) DEFAULT NULL,

    status ENUM('draft', 'pending', 'published', 'archived')
        NOT NULL DEFAULT 'pending',

    deleted_at TIMESTAMP NULL DEFAULT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_member_projects_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

-- =========================================
-- END OF SCHEMA
-- =========================================

