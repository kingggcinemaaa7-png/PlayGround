# Taç Savaşı — OKU (Türkçe)

1080×1920 dikey PixiJS oyunu. İzleyiciler otomatik dövüşçü olur; hediye/beğeni/yorum/takip oyunu sürükler.

## Hızlı başlat (Windows)

```bat
start.bat
```
- Bağımlılıkları kurar, köprüyü (`ws://localhost:8081`, deneme modu) + oyunu (`http://localhost:3002`) başlatır.
- Bu adresi tarayıcıda açıp **TikTok LIVE Studio** ile paylaş (dikey 1080×1920).

Test adresleri:
- `http://localhost:3002/?mock=1` — oyun içi deneme paneli (katılım, hediye yağmuru, boss, merhamet, gelgit)
- `http://localhost:3002/?duration=90&locale=tr-TR` — 90 sn Türkçe maç
- `http://localhost:3002/?duration=300&locale=es-MX` — 5 dk Meksika İspanyolcası

## Yönetim konsolu (F1)

Açılışta sağda açılır; **oyun tuvalinin dışındadır**, yani TikTok kaydına girmez.
`F1` ile aç/kapa, `?clean=1` ile tam ekran moduna geç.

- **Köprü:** TikTok WS adresi + Bağlan, bağlantı durumu noktası. Koparsa konsol
  kaç saniye dırildiğini gösterir ve **oyun kesinlikle devam eder** (üstel geri çekilme
  ile kendi kendine bağlanır; ekrana "SİNYAL YOK" uyarısı düşer)
- **Yayın:** Duraklat · Otomatik hediye · Dil (es-MX/es-ES/tr-TR/en) · Çift dil · Kamera şeridi (test deseni de var)
- **Ses:** Genel / Müzik / Efekt kaydırıcıları, Sessiz (**M**), **Müzik aç/kapa** düğmesi (efektler çalmaya devam eder), **kendi müzik dosyanı seç** (aşağıda). Altında canlı seviye ölçer: `ses: -20 dBFS RMS · tepe -3`. **KIRMIZI "KIRPMA" yazıyorsa** sesi kıs (yayında bozulma = kırpma).
- **Maç:** 1:30 / 5:00 / 25:00 · Yeni maç · sahne atla (Oyun/Bitiş/Tablo/Ödüller/Podyum/İntro)
- **Olaylar:** BOSS · Gelgit · Fırtına · Altın Yağmur · **Güvenli bölge** (çakışma kontrolü) · HUD bilgi · +1/+10/+50 izleyici
- **Otomasyon:** BOSS otomatik · Altın yağmur · Gece — her birini kapatabilirsin (kapalıyken o esneyi yalnız elle tetiklersin). "BOSS her N sn" kutusu: `0` = maçın %10/30/50/70/88'inde, `30` yazarsan 30 saniyede bir boss gelir.
- **Kalıcı:** Savaş ısısı (kenar kızarması) · Kamera nefesi
- **Hediye enjeksiyonu:** kayıttaki ilk 5 aktif hediye (tıklayınca test gönderilir) · Karışık 5 · Fırtına (30 hediye)
- **Hediye yönetimi:** her hediyeye kendi satırı — **isim** (tıklayınca test gider), **elmas**, **eylem** (hangi gücü tetiklesin), **●/○** (aç/kapa), **✕** (sil) · alttaki formdan yeni hediye ekle · *Varsayılana dön* ile fabrika kataloğu
- **Komutlar:** !kalkan !fuego !güç · 10 beğeni · serbest yazı (Enter)
- **Veri:** Telemetri CSV indir · Sıralamayı sil · canlı FPS/bellek/izleyici bilgisi

### Hediye yönetimi nasıl çalışır

Her TikTok hediyesi bir **eylem**e bağlıdır; ekranızda gelen hediyenin adı bu kayda bakılıp eşleştirilir.

| eylem | ne yapar |
|---|---|
| Varsayılan | sadece puan + seri (klasik hediye) |
| Ateş topu | ateş mermisi fırlatır |
| Meteor | gökten meteor yağdırır |
| Hortum | çevreye hortum |
| Kalkan | tüm arenaya kalkan |
| Hız | süper hız |
| İyileşme | can yeniler |
| Öfke · Hayalet · Vampir · Dev · Yansıtma · Zincir · Donma · Gölge | güçler (bkz. aşağıdaki tablo) |

- Kayıt **kalıcıdır** (`tac-gifts-v1`), sayfayı kapatsan da kalır. Sildiğin hediye bir daha gelmez.
- **●/○** ile kapatılan hediye tamamen yok sayılır (puan bile vermez) — seyircinin gönderdiği ama istemediğin hediyeler için.
- Silmek istemediğin hediyeyi kapatmak daha güvenlidir: TikTok tarafındaki hediye listesi bozulmaz.
- Yeni hediye adı TikTok'taki **gerçek adla aynı** olmalı (yazım/emoji farkı önemsiz, Türkçe büyük/küçük harf önemsiz: `ROSE` = `rose`). Emin değilsen önce **Enjeksiyon** satırından test et.

### Kendi müziğini seç (dosya seçici)

Klasöre dosya atmak da çalışır ama canlı yayında pratik olan **seçici**:

- Konsol → **Ses** → *Sakin müzik seç…* veya *Yoğun müzik seç…* → `.mp3/.wav/.ogg/.m4a` seç.
- Seçtiğin an çalınır, yoğun parça boss'ta, sakin parça normalde devreye girer.
- Seçim **kalıcıdır** (IndexedDB) — sayfayı kapatıp açsan da aynı parça gelir. Üstünde dosya adı yazar.
- *Seçili müzikleri sil* ile hazır parçalara dönersin.
- Not: bu parça **senin** müziğin; lisansı senden sorulur. Yayında kullanacaksan hakkı olduğundan emin ol.

## Müzik ve spiker dosyaları (tam yollar)

**Müzik** — `tac-savasi/assets/audio/` klasörüne at. Uzantı fark etmez (`.ogg`, `.wav`, `.mp3`, `.m4a`):

| dosya | ne olur |
|---|---|
| `music-calm.ogg` | normal oyunda sürekli çalar (depoda 8 sn'lik hazır döngü var, kendi parçanla değiştir) |
| `music-intense.ogg` | boss / altın yağmur / büyük seride devreye girer (depoda 8 sn'lik hazır döngü var). **Yoksa sakin müzik çalmaya devam eder — yayın asla sessiz kalmaz.** |
| `sfx-<isim>.wav` (shot, hit, kill, meteor, tornado, thunder, roar, tick, fanfare, tide, gift-t1..t5, streak-5/15/30/50) | hazır sentezlenmiş sesi değiştirir |

**Spiker nedir?** Spiker bir yapay zekâ **değil** — oyunun "duyurucu" sesi. 7 olayda (maç başı/bitişi, altın yağmur, merhamet, boss, seri) ekrandaki büyük yazıyla birlikte kısa bir ses çalar. Şu an o slotlarda benim ürettiğim kısa bip sesleri (placeholder) var; sen kendi dosyalarını koyunca onlar çalınır:

```
assets/audio/announcer/es-MX/match.start.wav  ...goldrain, mercy, boss, streak, match.end
assets/audio/announcer/es-ES/... (aynı 6 dosya)
assets/audio/announcer/tr-TR/... (aynı 6 dosya)
```

Kayıt için öneri: kendi sesin (telefon bile olur, 16-bit 44.1 kHz mono WAV). TikTok seyircin *seni* duyunca bağ kurar; yapay ses de olur ama kullandığın aracın ticari lisansına bak, bu para kazandıran bir yayın. Dosyaları attıktan sonra `node tools/sync-assets.mjs` çalıştır (veya `npm run build` — otomatik kopyalar). Konsoldaki **Ses** satırında dBFS seviyesini görürsün; hedef ≈ −16 (Genel/Müzik/Efekt kaydırıcılarıyla ayarla).

## Mavi ekranda kalırsa (açılmazsa)

Açılırken **"TAÇ SAVAŞI / Arena yükleniyor…"** yazısı görünür ve ilk karede kaybolur.
20. saniyede hâlâ açılmadıysa ekran **nedenini kendisi söyler**:

- **"JS başlamadı"** → oyun dosyaları bu adrese ulaşmıyor (tünel kopmuş / yanlış adres /
  dosya engellenmiş olabilir). Adresi ve bağlantıyı kontrol et.
- **"Yükleme sürüyor (yavaş bağlantı)"** → özellikle Cloudflare tüneli gibi uzak
  bağlantılarda olur. Oyun arkada açılmaya devam eder; ilk karede ekran kapanır.
  Beklemek istemiyorsan `?safemode=1` ekle — bu mod **hiçbir dosya istemez** (ses,
  kamera ve varlık taraması kapalı), en hızlı açılan moddur.

Ekranın fotoğrafını atarsan teşhis satırlarındaki **"Aşama"** bilgisinden takıldığı
yeri görürüm (`modül başladı` / `ayar okunuyor` / `pixi başlıyor` / `sahne kuruluyor`).

Diğer kontroller: donanım hızlandırma açık olsun (Chrome → Ayarlar → Sistem).
F12 konsolunda `Boot failed` satırı varsa tam metnini gönder.

## Komutlar (diller arası çalışır)

| komut | etki | bekleme |
|---|---|---|
| `!kalkan` / `!escudo` / `!shield` | 10 sn kalkan | 20 sn |
| `!ateş` / `!fuego` / `!fire` | 12 mermilik halka | 10 sn |
| `!cevap` / `!responde` / `!respond` | merhamette diriltir (veya hediye gönder) | — |
| `!güç` / `!poder` / `!power` | rastgele güç (12'li havuzdan) | 30 sn |
| `!takim rojo` / `!equipo azul` / `!team red` | **takım vuruşu**: kendine kalkan + en yakın düşmana 15 hasar. Takım skoru ekranda tutulur | — |
| `!yardım` / `!ayuda` / `!help` | komut listesini ekrana basar | — |
| `!deleteme` | verilerimi sil | — |

`!takim` rengini yazmadan gönderirsen rastgele bir taraf seçilir — yazmayı unutan seyirci
de eğlenceye katılır. Renk yazımı serbest: `kirmizi`, `kırmızı`, `rubi`, `rojo`, `red` hepsi aynı.

## Güçler (12 adet)

Avatarın üstündeki renkli haplar + halka rengi hangi gücün aktif olduğunu gösterir:

| güç | etki | süre | nereden |
|---|---|---|---|
| GÜÇ/FUERZA | +%50 hasar | 15 sn | T2+, boss, şimşek, !güç |
| HIZ/VELOCIDAD | x1.7 hız | 15 sn | T2+, boss, şimşek, beğeni (10 beğeni = 5 sn), !güç |
| ZEHİR/VENENO | 26px içinde 0.5 sn'de 8 hasar | 15 sn | T2+, boss, !güç |
| İYİLEŞME/CURACIÓN | +10 HP/sn | 15 sn | T2+, boss, !güç |
| ÇİFT/DOBLE | x2 hasar | 15 sn | T2+, seri kesme, boss, !güç |
| **ÖFKE/FURIA** | **x2 hasar, +%25 hız** | 8 sn | T4, boss, !güç |
| **HAYALET/FANTASMA** | **vurulamaz + hedeflenemez**, +%40 hız | 4 sn | T5, boss, !güç |
| **VAMPİR/VAMPIRO** | **verdiği hasarın %35'i can olur** | 10 sn | boss, !güç |
| **DEV/GIGANTE** | **1.6x boy, +100 can, x1.5 hasar** | 8 sn | boss, !güç |
| **YANSITMA/ESPEJO** | **mermileri %+20 ile geri yollar** | 6 sn | seri kesme, boss, !güç |
| **ZİNCİR/CADENA** | **öldürünce 3 yakına şimşek** | 10 sn | boss, !güç |
| **DONDURMA/HELADA** | **130px'yi 3 sn dondurur** (anında) | — | T3 (%50), !güç |
| **GÖLGE KLON** | **12 sn kopya savaşçı** (%70 hasar, skor sana yazar) | 12 sn | T5 |

Hasar tavanı her zaman **x3** — güçler tavana kadar istiflenir, üstüne çıkmaz.

## Hediye kademeleri (elmas)

T1 1–4: +30 HP, +1 seri • T2 5–49: +5 seri, hız, rastgele güç • T3 50–199: kalkan, çift hasar, güç •
T4 200–999: METEOR (90px, 60 hasar) + kahraman kartı • T5 1000+: SU TORNADOSU + kahraman kartı.
10 sn içindeki hediyeler kombo çarplanı ×1/1.5/2/3 verir.

Fabrika kataloğu 12 hediyedir (Rose, GG, Coffee, Ice Cream, Donut, Heart, Game, …). Bunların
varsayılan eylemleri konsolun **Hediye Yönetimi** tablosunda değiştirilebilir; kademe yalnızca
elmas değerine bakar, yani elması değiştirince hediye başka kademeye düşer.

## Sahnede neler oluyor (görsel ve savaş)

Bunlar otomatik çalışır, ayar gerektirmez:

- **Derinlik:** gökyüzü/deniz/ada farklı hızlarda kayar (parallax) + çok hafif kamera nefesi.
- **Kenar ışığı:** arenanın çevresinde ışık halkası ve taşlar; boss'ta kırmızı, finalde altın renkte **nabız atar**.
- **Sanat yönetimi:** gündüz → akşam → gece geçişi; fırtınada mavi, boss'ta kırmızı, son dakikada altın ton.
- **Nişan:** her oyuncu ateşe hazırlanırken hedefe doğru sarı bir çizgi ve nişangâh çıkar.
- **Ölüm:** avuç dönerek havada uçar, yere düşer, sönümlenir; geri dönüşte belirir.
- **Vuruş:** her isabette kıvılcım + hasar sayısı + ses; kritik vuruşta zoom ve ekran sarsıntısı.
- **Savaş ısısı:** seri/kalabalık arttıkça ekran kenarları ısınır, konfeti sıklaşır, müzik yoğunlaşır.
- **Boss fazları:** can %66 ve %33'te faz değişir — ekran sarsılır, kırmızı basınç artar, "FURIA MÁXIMA" çıkar.
- **Son 60 saniye:** "ÜLTİMO MINUTO" → son 30 saniye "TODO O NADA" → son 10 saniye "ÜLTIMOS 10", her adımda konfeti ve finale müziği.
- **Her hediye:** büyük kahraman kartı (ikon + isim + ne yaptığı) + aşağıdan yukarı kayan isim şeridi.
- **Yörünge silahı:** her savaşçının profil fotoğrafının etrafında **dönen yıldızlar** vardır.
  Yıldız bir düşmana değdiğinde hasar verir, parlar iz bırakır ve kıvılcım çıkarır.
  Rengi duruma göre değişir: normal altın · kalkan mavi · öfke kırmızı · dev altın ve büyük.
  Konsol → **Kalıcı** bölümünden yıldız sayısı / hasar / yarıçap ayarlanır (`0` = silah kapalı).

## Döngü

Giriş 3 sn → Maç (varsayılan 25:00; 1:30/5:00 hazır) → Bitiş 10 sn → Tablo → Ödüller 8 sn → Podyum 7 sn → yeni maç. Boş ekran yok.

## Terimler

MAÇ/PARTIDA • SERİ/RACHA • TAÇ/CORONA (Türkçede asla "korona" değil) • KALE/CASTILLO • ÖDÜLLER/PREMIOS • İLK 3/TOP 3.
