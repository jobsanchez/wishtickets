CREATE UNIQUE INDEX IF NOT EXISTS event_sections_event_id_name_unique_idx
ON public.event_sections (event_id, lower(trim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS event_sections_event_id_section_code_unique_idx
ON public.event_sections (event_id, upper(trim(section_code)));
