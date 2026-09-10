-- Add language field to support multi-language data
-- Run this migration before using --lang=jp parameter

-- Add language column to expansions table
ALTER TABLE expansions ADD COLUMN language TEXT DEFAULT 'en';

-- Add language column to cards table  
ALTER TABLE cards ADD COLUMN language TEXT DEFAULT 'en';

-- Create index for language filtering
CREATE INDEX IF NOT EXISTS idx_expansions_language ON expansions(language);
CREATE INDEX IF NOT EXISTS idx_cards_language ON cards(language);

-- Update existing data to 'en' (English)
UPDATE expansions SET language = 'en' WHERE language IS NULL;
UPDATE cards SET language = 'en' WHERE language IS NULL;

