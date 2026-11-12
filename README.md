# Influencer Takip

Marka ve influencer iş birliklerini takip etmek için bir panel.

## Yayınlama

Worker derlemesi için `node scripts/build.mjs` çalıştır. Worker giriş dosyası `dist/server/index.js` ve veritabanı bağlantısının adı `DB`. Yayınlamadan önce `drizzle/` içindeki SQL geçişlerini sırayla uygula.

Hosting sağlayıcısının çalışma zamanı ayarlarında `PANEL_PASSWORD` değerini gizli değişken olarak tanımla. `PANEL_USERNAME` isteğe bağlıdır ve varsayılanı `admin` olur. Panel, tarayıcının HTTP Basic giriş penceresini kullanır ve HTTPS üzerinden yayınlanmalıdır.
