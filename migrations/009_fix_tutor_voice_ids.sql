-- Fix tutor voice_id assignments (phpMyAdmin / mysql).
-- Kadın hocalar → female, erkekler → male, özel karakterler → kendi sesleri.

UPDATE tutors SET voice_id = 'WZlYpi1yf6zJhNWXih74'
WHERE slug IN ('elena','freya','camila','ines','amara','katie','vaelen');

UPDATE tutors SET voice_id = 'sJ8GED3d0sN1d0bmD6mH'
WHERE slug IN ('lingola','kenji','marco','julian','felix','erik','morgan','elrion');

UPDATE tutors SET voice_id = 'PIGsltMj3gFMR34aFDI3'
WHERE slug = 'diego';

UPDATE tutors SET voice_id = 'uDsPstFWFBUXjIBimV7s'
WHERE slug = 'santa';

UPDATE tutors SET voice_id = 'TsHrPyMlNFuIYnbODF01'
WHERE slug = 'zephyrion';

UPDATE tutors SET voice_id = 'wXvR48IpOq9HACltTmt7'
WHERE slug = 'ukrath';
