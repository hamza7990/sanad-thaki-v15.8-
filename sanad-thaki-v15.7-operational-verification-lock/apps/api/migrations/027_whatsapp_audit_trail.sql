-- Migration: 027_whatsapp_audit_trail.sql
-- Description: Add denormalized snapshot fields to whatsapp_messages table for persistent reminder history audit.

ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS customer_id text;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS total_amount numeric(14,2);
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS sender_user_id text;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS reminder_attempt_number integer;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS message_content text;
