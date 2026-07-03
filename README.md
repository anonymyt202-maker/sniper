# Uzum Userbot — Multi-User Telegram Userbot (GramJS)

BotFather'da Business Mode yo'q bo'lgani uchun, bu loyiha **haqiqiy userbot** (MTProto/GramJS) usulida ishlaydi:

1. Siz alohida **Manager Bot** (@BotFather orqali yaratilgan oddiy bot) orqali telefon raqamingiz bilan **login** qilasiz
2. Login qilingach, bot sizning shaxsiy akkauntingizga **GramJS client** sifatida ulanadi
3. Shu paytdan boshlab, o'zingiz yozgan `.` (nuqta) bilan boshlanuvchi xabarlar (masalan `.help`, `.ai salom`) buyruq sifatida ishlaydi — xuddi X-Sender, Hikka kabi userbotlardagidek
4. Har bir foydalanuvchi uchun **alohida sozlamalar** (SQLite bazada) saqlanadi — bitta bot ko'p odamga xizmat qiladi

---

## 1. Talab qilinadigan kalitlar

| Nima | Qayerdan olinadi |
|---|---|
| `BOT_TOKEN` | @BotFather → `/newbot` |
| `API_ID`, `API_HASH` | https://my.telegram.org → **API Development Tools** |
| `GROQ_API_KEY` | https://console.groq.com |

⚠️ **API_ID/API_HASH majburiy** — bular bo'lmasa GramJS shaxsiy akkauntga ulana olmaydi (bu Business Mode emas, balki to'g'ridan-to'g'ri MTProto login).

## 2. O'rnatish

```bash
npm install
cp .env.example .env
# .env faylini to'ldiring: BOT_TOKEN, API_ID, API_HASH, GROQ_API_KEY
```

`yt-dlp` serverga o'rnatilgan bo'lishi kerak (`.music` va `.down` uchun):

```bash
# Ubuntu/Debian (VPS)
sudo apt update && sudo apt install -y python3-pip ffmpeg
pip3 install -U yt-dlp

# yoki standalone binary
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

## 3. Ishga tushirish

```bash
npm start
```

## 4. Foydalanish oqimi

1. Manager botga `/start` yozing
2. `/login` yuboring → telefon raqamingizni yuboring (`+998901234567`)
3. Kelgan kodni **probel bilan ajratib** yuboring: `1 2 3 4 5` (Telegram botlarga to'g'ridan-to'g'ri kod kiritishni ba'zan bloklaydi, probel bu cheklovni chetlab o'tadi)
4. Agar 2FA (bulut paroli) yoqilgan bo'lsa, parolni yuboring
5. ✅ Ulanish tugagach, **shaxsiy akkauntingizda** (istalgan chatda, hatto "Saved Messages"da ham) `.help` deb yozing — barcha buyruqlar ro'yxati chiqadi
6. Sozlamalarni boshqarish uchun manager botga `/settings` yozing — screenshotdagi kabi tugmali menyu chiqadi (Reply qilish, Auto status, Profilga soat, 24/7 online, AI provider va h.k.)

## 5. Barcha buyruqlar (shaxsiy akkauntda ishlatiladi)

```
.help              — buyruqlar ro'yxati
.ping              — bot tezligi
.add_message <matn> — auto xabar qo'shish
.list_messages     — auto xabarlarni ko'rish
.info              — o'zingiz/suhbatdosh haqida ma'lumot (reply qilib ishlatish mumkin)
.kurs              — CBU valyuta kurslari
.crypto            — Binance kripto narxlari
.type <matn>       — harfma-harf yozish animatsiyasi
.music <nom>       — YouTube'dan qo'shiq qidirib mp3 yuklash
.ai <savol>        — Groq (ChatGPT uslubida) javob
.grok <savol>      — Groq (Grok uslubida) javob
.img / .rasm       — hozircha o'chirilgan (stub) — xohlasangiz keyin ulaymiz
.down <link>       — Instagram/YouTube/TikTok/Facebook yuklab olish
.soat / .soat_off  — profilga soat qo'yish yoqish/o'chirish
.online / .offline — 24/7 online rejim
.status <matn>     — bio/status o'zgartirish
.auto_status_on/off — profil "about"ni har 3.5s da random emoji bilan aylantirish
.cheklist          — ko'p qatorli cheklist yaratish
.emoji <matn>      — random stil bilan matnni bezash (bir martalik)
.emoji1..emoji6    — 6 xil stil (fullwidth, bold, script, double, frozen, circled) (bir martalik)
.emoji on          — Avto-emoji rejimini yoqish: shundan keyin yozgan HAR QANDAY oddiy (buyruqsiz) xabaringiz avtomatik random stilda bezaladi
.emoji on 1..6     — Avto-emoji rejimini aniq stil bilan yoqish (masalan `.emoji on 3` — doim "script" stil)
.emoji off         — Avto-emoji rejimini o'chirish
.dice / .dice1-6   — random yoki aniq dice (🎲🎯🏀⚽🎳🎰) yuborish
```

## 6. `.settings` haqida muhim eslatma

Rasmda ko'rsatilgan katta tugmali menyu (Tahrirlanish, O'chirishlar, Reply qilish, va h.k.) — bu **Telegram'ning o'z Business Chatbot** interfeysi bo'lib, u faqat rasmiy Business Mode orqali ishlaydi. Sizning holatingizda Business Mode ochilmagani sababli, biz **xuddi shu funksional mazmunni** manager botdagi `/settings` inline-tugmalari orqali qayta yaratdik (`src/settingsKeyboard.js`) — tugmalar bosilganda darhol GramJS orqali real vaqtda ishga tushadi (masalan Auto status yoqilsa, profilingiz shu zahoti aylantirila boshlaydi).

## 7. Xavfsizlik bo'yicha muhim ogohlantirish

- `session_string` — bu shaxsiy akkauntingizga **to'liq kirish kaliti**. `data/userbot.db` faylini hech kimga bermang, backup qilsangiz shifrlab saqlang
- Bir nechta odam ulansa, har birining sessiyasi alohida saqlanadi va faqat o'sha `manager_chat_id` orqaligina boshqariladi
- Telegram MTProto orqali ko'p va tez-tez `UpdateProfile` chaqirish (`auto_status_on`) flood-limitga olib kelishi mumkin — shuning uchun interval 3.5 soniyaga o'rnatilgan, undan tezlashtirish tavsiya etilmaydi
- VPS/Railway'da uzoq muddat ishlatish uchun `PM2` yoki Railway'ning avtomatik restart imkoniyatidan foydalaning:
  ```bash
  npm i -g pm2
  pm2 start src/manager.js --name uzum-userbot
  pm2 save
  ```

## 8. Papka strukturasi

```
uzum-userbot/
├── src/
│   ├── manager.js          # Kirish nuqtasi - manager bot (login/settings)
│   ├── loginFlow.js        # Telefon/kod/2FA login jarayoni
│   ├── userbotManager.js   # Har bir user uchun GramJS client + barcha . komandalar
│   ├── settingsKeyboard.js # /settings inline tugmalari
│   ├── db.js                # SQLite (better-sqlite3) - users, settings, auto_messages
│   └── features/
│       ├── autoStatus.js    # Auto status aylantirish
│       ├── profileClock.js  # Profilga soat qo'yish
│       ├── rates.js         # Valyuta/kripto narxlari
│       ├── downloader.js    # yt-dlp orqali yuklab olish
│       └── emojiText.js     # Premium-style matn transformerlari
├── data/                    # SQLite baza shu yerda yaratiladi
├── downloads/                # Vaqtinchalik yuklab olingan fayllar
├── package.json
└── .env.example
```

## 9. Kengaytirish g'oyalari

- `.img` / `.rasm` — Stability AI, Pollinations.ai yoki boshqa rasm generatsiya API ulash mumkin
- `.ok` (o'chib ketuvchi media saqlash) — `NewMessage` eventida `ttlSeconds` bor xabarlarni avtomatik yuklab olish logikasi qo'shiladi
- Auto-reply (barchaga yoki tanlangan chatlarga) — `NewMessage({incoming: true})` handler qo'shib, `settings.auto_reply_all` ga qarab Groq orqali javob yozish mumkin (asos allaqachon `userbotManager.js`da bor, faqat handler yo'q)
