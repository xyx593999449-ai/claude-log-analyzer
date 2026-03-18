-- ============================================
-- PostgreSQL DDL for POI Tables
-- Database: big_poi
-- Generated: 2026-03-18
-- ============================================

-- Table: poi_init
-- 初始POI数据表
CREATE TABLE poi_init (
    x_coord real,
    y_coord real,
    status integer,
    updatetime timestamp without time zone,
    task_id text NOT NULL,
    city text,
    city_adcode text,
    verify_status character varying,
    verify_priority character varying,
    address text,
    id text NOT NULL,
    name text NOT NULL,
    poi_type text
);

-- Table: poi_verified
-- 已核实的POI数据表
CREATE TABLE poi_verified (
    y_coord real,
    verify_info jsonb,
    evidence_record jsonb,
    changes_made jsonb,
    overall_confidence real,
    verify_time timestamp without time zone,
    updatetime timestamp without time zone,
    poi_status integer,
    x_coord real,
    original_task_id text,
    original_id text,
    verification_notes text,
    verified_by character varying,
    task_id text NOT NULL,
    verification_version character varying,
    id text NOT NULL,
    name text NOT NULL,
    poi_type text,
    address text,
    city text,
    city_adcode text,
    verify_status character varying NOT NULL,
    verify_result character varying NOT NULL
);

-- Table: poi_qc
-- 质检POI数据表
CREATE TABLE poi_qc (
    evidence_record jsonb,
    x_coord real,
    y_coord real,
    poi_status integer,
    qc_score integer,
    qc_result jsonb,
    is_qualified integer,
    has_risk integer,
    is_auto_approvable integer,
    is_manual_required integer,
    is_downgrade_consistent integer,
    qc_time timestamp without time zone,
    updatetime timestamp without time zone,
    verify_info jsonb,
    downgrade_issue_type character varying,
    downgrade_status character varying,
    qc_by character varying,
    id character varying,
    batch_id character varying,
    name character varying,
    original_task_id character varying,
    qc_version character varying,
    poi_type character varying,
    address character varying,
    city character varying,
    city_adcode character varying,
    task_id character varying NOT NULL,
    verify_result character varying,
    quality_status character varying,
    qc_status character varying
);
