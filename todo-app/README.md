# Winery Board ( Todo-App )

Winery Board, kullanıcı bazlı todo listeleri ile yönetici panelini birleştiren React + TypeScript + Vite tabanlı bir arayüzdür. Görevler kullanıcı hesabına kaydedilir, bildirim desteği mevcuttur ve /admin rotası üzerinden tüm kullanıcılar ile görevleri izleyebilen bir yönetici görünümü bulunur.

## Özellikler
- Kayıt / giriş akışı 
- Her kullanıcı için kalıcı todo listesi
- Görev filtreleri (all / active / done)
- Bildirim ile tamamlandı hatırlatmaları
- Admin panelinden kullanıcı ekleme ve görevleri görüntüleme

## Kurulum
```bash
git clone <repo>
cd auth-service
npm install
cd todo-app
npm install
```

## Geliştirme Ortamı
Backend’i ve frontend’i ayrı terminallerde çalıştırman gerek sebebini sorma kafam karıştı:
```bash
# Terminal 1
cd auth-service
npm start

# Terminal 2
cd todo-app
npm run dev
```

Varsayılan admin hesabı `.env` ile değiştirilebilir; şuanki`owner@winery.board / wineryadmin` AYRICA ŞUANKİ SİTEYE BUNUNLA GİRMEYE ÇALIŞMA DEĞİŞTİRDİM ÇÜNKÜ.

## Üretim Derlemesi
```bash
cd auth-service
npm start   # veya kendi barındırma yönteminiz bu localhost için sadece

cd ../todo-app
npm run build
npm run preview
```

Frontend, backend adresini `VITE_API_URL` ile alır; üretimde uygun URL’i tanımlamanız yeterlidir. `vercel gibi domaine paramız yetmez `

```bash
TÜM GELİŞTİRME SÜRECİ:
Discord: @wineryy
Github: @wineryxd
KULLANICISINA AİTTDİR.
```
