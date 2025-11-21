-- VER (Verified Erection Report) schema for MySQL
-- This file defines tables used to store builders rankings exported from Eclesiar.
-- Create the database itself manually in phpMyAdmin and then run this script inside it.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Table: builders (players)
CREATE TABLE IF NOT EXISTS builders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(191) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_builders_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: buildings (unique construction targets)
CREATE TABLE IF NOT EXISTS buildings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  region VARCHAR(191) NOT NULL,
  building_type VARCHAR(191) NOT NULL,
  level INT NOT NULL,
  slug VARCHAR(191) DEFAULT NULL,
  extra_info JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_buildings_region_type_level (region, building_type, level),
  KEY idx_buildings_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: ranking_snapshots (single exported ranking for one building)
CREATE TABLE IF NOT EXISTS ranking_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  building_id BIGINT UNSIGNED NOT NULL,
  captured_at DATETIME NOT NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source VARCHAR(191) DEFAULT NULL,
  client_user_agent TEXT,
  page_url TEXT,
  payload_hash CHAR(64) NOT NULL,
  api_key_used VARCHAR(191) DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_snapshots_building_captured (building_id, captured_at),
  KEY idx_snapshots_payload_hash (payload_hash),
  CONSTRAINT fk_snapshots_building
    FOREIGN KEY (building_id) REFERENCES buildings(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: ranking_entries (rows of ranking inside a snapshot)
CREATE TABLE IF NOT EXISTS ranking_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  snapshot_id BIGINT UNSIGNED NOT NULL,
  builder_id BIGINT UNSIGNED NOT NULL,
  rank_position INT NOT NULL,
  points DECIMAL(15,3) UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_entries_snapshot (snapshot_id),
  KEY idx_entries_builder_snapshot (builder_id, snapshot_id),
  KEY idx_entries_builder (builder_id),
  CONSTRAINT fk_entries_snapshot
    FOREIGN KEY (snapshot_id) REFERENCES ranking_snapshots(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_entries_builder
    FOREIGN KEY (builder_id) REFERENCES builders(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
