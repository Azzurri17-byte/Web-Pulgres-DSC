-- Allow learning materials to be uploaded as files without a separate URL.
ALTER TABLE learning_materials
    MODIFY COLUMN url_module VARCHAR(255) NULL;
