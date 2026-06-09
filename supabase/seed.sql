-- Seed venues, sections, seats, and events.
-- Run this in Supabase SQL Editor after migrations.
-- Requires seed-psgc.sql (Philippine provinces/cities) to run first.

\ir seed-psgc.sql

-- Venues (fixed IDs for reference; province_id, city_id from geography)
INSERT INTO public.venues (id, name, province_id, city_id, standard_capacity)
SELECT '11111111-1111-1111-1111-111111111101'::uuid, 'Manila Grand Theater', p.id, c.id, 100
FROM public.provinces p
JOIN public.cities c ON c.province_id = p.id
WHERE p.name = 'Metro Manila' AND c.name = 'Manila'
LIMIT 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.venues (id, name, province_id, city_id, standard_capacity)
SELECT '11111111-1111-1111-1111-111111111102'::uuid, 'Smart Araneta Coliseum', p.id, c.id, 100
FROM public.provinces p
JOIN public.cities c ON c.province_id = p.id
WHERE p.name = 'Metro Manila' AND c.name = 'QUEZON CITY'
LIMIT 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.venues (id, name, province_id, city_id, standard_capacity)
SELECT '11111111-1111-1111-1111-111111111103'::uuid, 'Intramuros Manila', p.id, c.id, 100
FROM public.provinces p
JOIN public.cities c ON c.province_id = p.id
WHERE p.name = 'Metro Manila' AND c.name = 'Manila'
LIMIT 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.venues (id, name, province_id, city_id, standard_capacity)
SELECT '11111111-1111-1111-1111-111111111104'::uuid, 'SMX Convention Center', p.id, c.id, 100
FROM public.provinces p
JOIN public.cities c ON c.province_id = p.id
WHERE p.name = 'Metro Manila' AND c.name = 'PASAY CITY'
LIMIT 1
ON CONFLICT (id) DO NOTHING;

-- Sections for Manila Grand Theater (for free seating) – skip if already present
INSERT INTO public.sections (venue_id, name, capacity)
SELECT '11111111-1111-1111-1111-111111111101'::uuid, 'General Admission', 500
WHERE EXISTS (SELECT 1 FROM public.venues WHERE id = '11111111-1111-1111-1111-111111111101')
  AND NOT EXISTS (SELECT 1 FROM public.sections WHERE venue_id = '11111111-1111-1111-1111-111111111101' AND name = 'General Admission');

-- Seats for Manila Grand Theater (assigned seating) – skip if any seats exist for this venue
INSERT INTO public.seats (venue_id, row_label, seat_number)
SELECT v.id, t.row_label, t.seat_number
FROM public.venues v
CROSS JOIN (
  VALUES ('A', '1'), ('A', '2'), ('A', '3'), ('A', '4'), ('A', '5'),
         ('B', '1'), ('B', '2'), ('B', '3'), ('B', '4'), ('B', '5'),
         ('C', '1'), ('C', '2'), ('C', '3'), ('C', '4'), ('C', '5')
) AS t(row_label, seat_number)
WHERE v.id = '11111111-1111-1111-1111-111111111101'
  AND NOT EXISTS (SELECT 1 FROM public.seats WHERE venue_id = '11111111-1111-1111-1111-111111111101' LIMIT 1);

-- Events (match UI reference: Rock Fiesta, Championship Finals, etc.)
INSERT INTO public.events (slug, title, description, short_description, category, status, image_url, venue_id, event_start, event_end) VALUES
  (
    'rock-fiesta-2026',
    'Rock Fiesta 2026',
    'Don''t miss this amazing concert featuring top performers and special guests from the local and international rock scene. A night of live music, energy, and unforgettable moments.',
    'Don''t miss this amazing concert featuring top performers and special guests from...',
    'Shows & Concerts',
    'published',
    'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=800',
    '11111111-1111-1111-1111-111111111101',
    '2026-03-15 19:00:00+08',
    '2026-03-15 23:00:00+08'
  ),
  (
    'championship-finals',
    'Championship Finals',
    'Experience the thrill of live sports as top teams clash in the ultimate showdown. Cheer for your favorite team and witness history in the making.',
    'Experience the thrill of live sports as top teams clash in the ultimate showdown...',
    'Sports',
    'published',
    'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800',
    '11111111-1111-1111-1111-111111111102',
    '2026-03-22 18:30:00+08',
    '2026-03-22 21:30:00+08'
  ),
  (
    'heritage-night-tour',
    'Heritage Night Tour',
    'A multi-ancient culture experience exploring historical landmarks and local heritage. Walk through Intramuros and discover stories of the past.',
    'A multi-ancient culture experience exploring historical landmarks and local...',
    'Tours & Attraction',
    'published',
    'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800',
    '11111111-1111-1111-1111-111111111103',
    '2026-04-05 17:00:00+08',
    '2026-04-05 20:00:00+08'
  ),
  (
    'tech-summit-2026',
    'Tech Summit 2026',
    'An exclusive corporate event featuring renowned speakers and industry experts. Network, learn, and shape the future of technology.',
    'An exclusive corporate event featuring renowned speakers and industry experts.',
    'Corporate Events',
    'published',
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800',
    '11111111-1111-1111-1111-111111111104',
    '2026-04-12 10:00:00+08',
    '2026-04-12 18:00:00+08'
  ),
  (
    'fun-day-carnival',
    'Fun Day Carnival',
    'Bring the whole family for a day of rides, games, and unforgettable fun. Food stalls, live entertainment, and activities for all ages.',
    'Bring the whole family for a day of rides, games, and unforgettable fun.',
    'Family',
    'published',
    'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800',
    '11111111-1111-1111-1111-111111111101',
    '2026-04-20 10:00:00+08',
    '2026-04-20 20:00:00+08'
  ),
  (
    'acoustic-night-live',
    'Acoustic Night Live',
    'Experience the best in live entertainment with friends and family in an intimate setting. Unplugged performances from talented local artists.',
    'Experience the best in live entertainment with friends and family in an intimate...',
    'Shows & Concerts',
    'published',
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
    '11111111-1111-1111-1111-111111111101',
    '2026-05-01 20:00:00+08',
    '2026-05-01 23:00:00+08'
  ),
  (
    'marathon-2026',
    'Marathon 2026',
    'Join thousands of runners in the biggest marathon event of the year. Multiple categories and a festival atmosphere at the finish line.',
    'Join thousands of runners in the biggest marathon event of the year.',
    'Sports',
    'published',
    'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=800',
    '11111111-1111-1111-1111-111111111102',
    '2026-05-10 05:00:00+08',
    '2026-05-10 12:00:00+08'
  ),
  (
    'indie-music-fest',
    'Indie Music Fest',
    'A celebration of independent music artists and emerging talents. Discover new sounds and support the local indie scene.',
    'A celebration of independent music artists and emerging talents.',
    'Shows & Concerts',
    'published',
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800',
    '11111111-1111-1111-1111-111111111101',
    '2026-05-18 16:00:00+08',
    '2026-05-18 23:00:00+08'
  )
ON CONFLICT (slug) DO NOTHING;

-- Add YouTube teasers for View Details dialog (dynamic video link)
UPDATE public.events SET teaser_video_url = 'https://www.youtube.com/watch?v=9bZkp7q19f0' WHERE slug = 'indie-music-fest';
UPDATE public.events SET teaser_video_url = 'https://www.youtube.com/watch?v=OPf0YbXqDm0' WHERE slug = 'rock-fiesta-2026';
