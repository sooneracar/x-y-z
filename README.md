# [X~Y~Z]

TikTok LIVE için **hediye ile büyüyen yaratık** overlay sistemi. İzleyiciler hediye gönderdikçe yaratık
evrim geçirir; final forma ulaşıp sezon eşiği dolunca sezon kapanır, liderler **Efsaneler Listesi**'ne
yazılır ve sıradaki yaratık yumurtadan başlar.

Altı sezon sırayla döner: Ateş = **Ignara**, Su = **Aquevo**, Toprak = **Terrok**, Hava = **Zefira**,
Işık = **Luminox**, Gölge = **Umbrix**.

## Kurulum

Node.js 20 veya üstü gerekir.

```bash
npm install
cp .env.example .env      # TIKTOK_USERNAME değerini yazın
npm start
```

| Adres | Ne |
| --- | --- |
| `http://127.0.0.1:3000/overlay/` | OBS / TikTok LIVE Studio "Browser Source" (1920×1080) |
| `http://127.0.0.1:3000/panel/` | Yayıncı / moderatör kontrol paneli |

`.env` asla repoya girmez (`.gitignore`'da). `TIKTOK_USERNAME` boşsa connector kapalı kalır, sistem yalnızca
manuel panelle çalışır. `PANEL_TOKEN` tanımlarsanız paneli `…/panel/?token=DEĞER` adresiyle açın.

### Overlay adres seçenekleri

- `?scene=full` — arka plan sahnesi kenarlarda saydamlaşmadan tüm ekranı kaplar
- `?scene=off` — sahne kapalı, yalnızca yaratık + arayüz
- `?mute=1`, `?volume=0.5` — ses

## Klasörler

```
backend/        Node.js sunucu: connector, oyun mantığı, WebSocket, REST, kalıcı durum
overlay/        Tarayıcı kaynağı: 3 katman (sahne / yaratık / arayüz) + sfx/
control-panel/  Manuel kontrol paneli
config/         Ayarlar (default.json; isteğe bağlı local.json üzerine yazar)
tools/          Ses efekti üreteci
test/           Oyun mantığı testleri (npm test)
data/, logs/    Çalışma anında oluşur, repoya girmez
```

## Ayarlar — `config/default.json`

Kendi değerleriniz için aynı yapıda bir `config/local.json` oluşturun; yalnızca değiştirdiğiniz bölümleri yazın.

| Alan | Anlamı |
| --- | --- |
| `tiers[].minCoins / maxCoins` | Kademenin jeton aralığı (hediyenin **birim** değeri). Aralıklar bitişik olmalı, sonuncusu açık uçlu. |
| `tiers[].points` | O kademenin büyüme puanı. Combo'da tekrar sayısıyla çarpılır. |
| `tiers[].manualCoins` | Manuel tetiklemede lider tablosuna ve sezon toplamına yazılan jeton. |
| `stages[].threshold` | O evreden bir sonrakine geçmek için gereken puan. |
| `decay.pointsPerMinute` | Hediye gelmeyince barın dakikada kaç puan gerilediği. |
| `decay.graceSeconds` | Son hediyeden sonra gerileme başlamadan önceki bekleme. |
| `season.closeThresholdCoins` | Sezon kapanışı için gereken toplam jeton. |
| `season.legendaryClosesAtFinalStage` | Final formdayken efsanevi hediye sezonu hemen kapatır. |
| `combo.streakTimeoutSeconds` | Bitiş mesajı gelmeyen bir combo'nun kaç saniye sonra kapatılacağı. |

## Kurallar

- **Dört sabit kademe**: Ucuz (1–9), Orta (10–99), Nadir (100–999), Efsanevi (1000+). Efsanevi, bar boş olsa
  bile yaratığı anında bir sonraki evreye atlatır.
- **Tamamen deterministik**: aynı hediye her zaman aynı etkiyi verir. Kodda hiçbir şans unsuru yok; overlay'de
  `Math.random` bile kullanılmaz (ortam hareketi zamanın sabit bir fonksiyonudur).
- **Gerileme**: bar, son hediyeden beri geçen gerçek süreye göre azalır. Zaman damgasından hesaplandığı için
  sunucu kapalıyken geçen süre açılışta tek seferde uygulanır. Evre geri düşmez, yalnızca bar azalır.
- **Sezon kapanışı**: final form + sezon toplamı ≥ eşik. Lider tablosu Efsaneler Listesi'ne kaydedilir, durum
  sıfırlanır, sıradaki yaratık başlar.
- **Tekrar koruması**: her hediye olayı kimliğiyle bir kez işlenir (yeniden başlatmada da).
- **Combo**: seri hediyeler bitince tek olay olarak işlenir (`repeatCount` ile).
- **İsimsiz gönderen**: "Gizli Destekçi".

## Manuel tetikleme API'si

```bash
curl -X POST http://127.0.0.1:3000/manual-trigger \
  -H 'content-type: application/json' \
  -d '{"tier":"nadir","sender":"Ayşe"}'
```

`tier`: `ucuz | orta | nadir | efsanevi` ya da `1–4`. `sender` isteğe bağlı. `PANEL_TOKEN` varsa
`x-panel-token` başlığı gerekir. Gerçek hediyeyle aynı yoldan işlenir.

Diğer uçlar: `GET /api/state`, `GET /api/config`, `GET /api/legends`, WebSocket `/ws`.

## Bağlantı sağlığı

Connector koparsa backend çalışmaya devam eder ve artan aralıklarla (5–60 sn) yeniden dener. Her kopuş ve süresi
`logs/connection.log` dosyasına ve kontrol panelindeki "Kesinti geçmişi"ne yazılır. Overlay'in bağlantısı
koparsa izleyiciye hiçbir şey gösterilmez; panelde "Bağlı overlay" göstergesi kırmızıya döner ve log'a düşer.

## Sesler

`overlay/sfx/` altındaki yedi efekt (`idle`, `tier1`–`tier4`, `leaderboard`, `season`) `npm run sfx` ile
sıfırdan sentezlenir; üçüncü taraf ses veya konuşma içermez. Kendi efektlerinizi aynı adlarla koyabilirsiniz.

## Bilinçli olarak olmayanlar

- **Kamera / webcam yok.** Overlay hiçbir medya cihazına erişmez.
- **Yapay zekâ seslendirmesi yok.** Sözlü anonsu yayıncı kendi sesiyle yapar.
- **Çark, çekiliş, rastgele ödül yok.**
- **Yayın başlığı** sistemin kapsamı dışındadır; her yayında elle yazılır.

## Notlar

- Hediye dinleme, resmî olmayan [`tiktok-live-connector`](https://www.npmjs.com/package/tiktok-live-connector)
  paketiyle yapılır. TikTok tarafındaki değişiklikler bağlantıyı bozabilir; bu yüzden manuel panel her zaman
  hazır durur. Paket imzalama için Euler Stream servisini kullanır; sık bağlanıyorsanız `.env` içine
  `EULER_API_KEY` ekleyin.
- Yaratık ve sahne görselleri tamamen kodla çizilir (`overlay/creature.js`, `overlay/scene.js`); hazır asset yok.
