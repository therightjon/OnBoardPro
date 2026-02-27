-- Migration: 0027_email_global_settings
-- Adds a single-row config table for global email layout settings
-- (header/footer text and colors, page/card background colors).

CREATE TABLE IF NOT EXISTS email_global_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  header_text TEXT NOT NULL DEFAULT 'OnBoardPro',
  header_bg_color TEXT NOT NULL DEFAULT '#1e293b',
  header_text_color TEXT NOT NULL DEFAULT '#ffffff',
  footer_text TEXT NOT NULL DEFAULT 'Sent by OnBoardPro',
  footer_bg_color TEXT NOT NULL DEFAULT '#f8fafc',
  footer_text_color TEXT NOT NULL DEFAULT '#64748b',
  page_bg_color TEXT NOT NULL DEFAULT '#f4f4f5',
  card_bg_color TEXT NOT NULL DEFAULT '#ffffff',
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the single config row with factory defaults
INSERT INTO email_global_settings (header_text, header_bg_color, header_text_color, footer_text, footer_bg_color, footer_text_color, page_bg_color, card_bg_color)
VALUES ('OnBoardPro', '#1e293b', '#ffffff', 'Sent by OnBoardPro', '#f8fafc', '#64748b', '#f4f4f5', '#ffffff');
