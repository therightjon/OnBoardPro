-- Add 'offer_declined' status to the candidate_status enum
-- This status acts like 'canceled' but displays "Offer Declined" in UI

ALTER TYPE candidate_status ADD VALUE IF NOT EXISTS 'offer_declined' AFTER 'canceled';
