const crypto = require('crypto');
const urls = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://unpkg.com/lucide@latest'
];
(async () => {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      const hash = crypto.createHash('sha384').update(text).digest('base64');
      console.log(`${url} -> sha384-${hash}`);
    } catch(e) { console.error(e); }
  }
})();
