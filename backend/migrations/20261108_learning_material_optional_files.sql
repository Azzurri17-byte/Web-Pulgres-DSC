-- Learning materials can be shared by URL without an uploaded file.
ALTER TABLE learning_materials
    MODIFY COLUMN file_name VARCHAR(255) NULL,
    MODIFY COLUMN file_path VARCHAR(500) NULL,
    MODIFY COLUMN file_size BIGINT UNSIGNED NULL;
