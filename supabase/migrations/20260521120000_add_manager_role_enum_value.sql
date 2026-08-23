-- Migration: Add 'manager' to the user_role enum
-- Date: 2026-05-21
--
-- NOTE: A new enum value cannot be ADDED and USED in the same transaction in
-- Postgres. This migration only adds the value; the column/constraints/policies
-- that reference it live in the next migration (…_add_manager_department_and_policies).

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'manager';
