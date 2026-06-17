// frontend/src/features/legal/pages/LegalPage.jsx
import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { BrandLogo } from '@/shared/components/BrandLogo';

const DOCS = {
  terms: {
    label: 'Kullanım Koşulları',
    icon: 'gavel',
    updated: '2 Haziran 2026',
    content: `1. TARAFLAR VE SÖZLEŞMENİN KAPSAMI

İşbu Kullanım Koşulları ve Sorumluluk Reddi Beyanı ("Koşullar"), PivotRadar ("Platform", "Hizmet Sağlayıcı") ile Platform'a kaydolan veya Platform'u herhangi bir yolla kullanan gerçek kişi ("Kullanıcı") arasında akdedilen elektronik bir sözleşmedir. Platform'a erişim sağlamak, hesap oluşturmak veya herhangi bir özelliğini kullanmak, işbu Koşulları ve bağlı tüm politikaları (KVKK Aydınlatma Metni, Gizlilik Politikası, Çerez Politikası) kayıtsız şartsız kabul ettiğiniz anlamına gelir.

Eğer bu Koşulları kabul etmiyorsanız, lütfen Platform'u kullanmayınız.

2. HİZMETİN MAHİYETİ VE SINIRI

PivotRadar; Borsa İstanbul (BIST) verilerini matematiksel algoritmalar, teknik analiz yöntemleri ve makine öğrenmesi (ML) modelleri aracılığıyla işleyerek kullanıcıya istatistiksel çıktılar, görselleştirmeler ve karar destek verileri sunan bir yazılım platformudur.

Platform'un sunduğu tüm içerikler, çıktılar ve veriler "Olduğu Gibi" (As-Is) ve "Mevcut Haliyle" (As-Available) esasına dayanır; hiçbir açık veya zımni garanti verilmez.

3. SPK UYARISI VE YATIRIM TAVSİYESİ REDDİ

YASAL UYARI: Platform üzerinde yer alan QRS Skorları, ML Sinyalleri, Formasyon Tespitleri, Hedef Fiyat Tahminleri, Momentum Listeleri veya diğer tüm içerikler; 6362 sayılı Sermaye Piyasası Kanunu, Sermaye Piyasası Kurulu (SPK) düzenlemeleri ve ilgili ikincil mevzuat kapsamında YATIRIMTAVSİYESİ, PORTFÖY YÖNETİMİ veya FİNANSAL DANIŞMANLIK hizmeti niteliği taşımamaktadır.

PivotRadar, SPK tarafından yatırım danışmanlığı veya portföy yönetimi faaliyeti yürütmek üzere yetkilendirilmiş bir kuruluş değildir. Platform içerikleri yalnızca bilgilendirme ve eğitim amacıyla sunulan istatistiksel model çıktılarıdır.

Kullanıcı; Platform çıktılarını birincil veya tek yatırım kriteri olarak kullanamaz. Borsa işlemlerinin yüksek sermaye riski içerdiğini, geçmiş performansın (Backtest sonuçları dahil) gelecekteki sonuçları garanti etmediğini peşinen kabul eder. Kullanıcı, kendi araştırması ve sorumluluğuyla aldığı alım-satım kararlarından doğan her türlü kâr veya zarardan münhasıran kendisi sorumludur.

4. VERİ KAYNAKLARI, DOĞRULUK VE TEKNİK SINIRLAMALAR

Platform, piyasa verilerini üçüncü taraf API sağlayıcılarından temin eder. Bu kapsamda:

— BIST Verileri: Üçüncü taraf sağlayıcılar aracılığıyla yaklaşık 15 dakika gecikmeli (delayed) olarak iletilmektedir.
— Veri Güncelliği: Veriler reel zamanlı olmayabilir; teknik aksaklıklar, veri sağlayıcı kesintileri veya API limitleri nedeniyle geçici eksiklikler yaşanabilir.
— ML Model Güvenilirliği: Makine öğrenmesi modelleri olasılıksal çalışır; herhangi bir tahmin için %100 doğruluk taahhüdü verilmez.
— Backtest Verisi: Geçmiş dönem simülasyon sonuçları, gelecekteki performansın garantisi veya güvencesi değildir.

Veri sağlayıcısı kaynaklı hatalar, gecikmeler, eksiklikler veya yanlışlıklar nedeniyle oluşan zararlardan Platform sorumlu tutulamaz.

5. SORUMLULUK SINIRI

Yürürlükteki mevzuatın izin verdiği azami ölçüde:

— Platform, doğrudan, dolaylı, arızi, özel, sonuçsal veya cezai nitelikteki hiçbir zarara (kâr kaybı, veri kaybı, iş durması dahil) karşı sorumlu değildir.
— Platform'un herhangi bir sebeple kullanılamamasından doğan kayıplardan Platform sorumlu tutulamaz.
— Kullanıcı'nın yatırım kararları neticesinde uğradığı zararlardan Platform hiçbir surette sorumlu değildir.
— Platform'un toplam sorumluluğu, ilgili kullanıcının son 12 aylık dönemde ödediği abonelik bedelini hiçbir koşulda aşamaz.

6. KULLANICI YÜKÜMLÜLÜKLERI VE YASAKLI DAVRANIŞLAR

Kullanıcı; (a) hesap bilgilerinin güvenliğini sağlamak, (b) Platform'u yalnızca kişisel ve ticari olmayan amaçlarla kullanmak, (c) sistemlerin bütünlüğünü tehdit eden her türlü eylemden kaçınmakla yükümlüdür.

Açıkça yasak olan eylemler: (i) Platform verilerinin izinsiz toplu çekilmesi (scraping, crawling), (ii) otomatik araçlarla sistem kaynaklarının aşırı kullanımı, (iii) reverse engineering veya kaynak kodun kopyalanması, (iv) Platform altyapısına zarar verebilecek saldırı girişimleri, (v) sahte veya yanıltıcı kimlikle hesap oluşturulması.

Bu yükümlülüklerin ihlali halinde Platform, önceden bildirim yapmaksızın hesabı geçici veya kalıcı olarak askıya alma ve kanunen mevcut tüm hukuki yollara başvurma hakkını saklı tutar.

7. FİKRİ MÜLKİYET HAKLARI

Platform bünyesindeki tüm yazılım kodu, algoritmalar, veri modelleri, ekran tasarımları, grafikler, kullanıcı arayüzü öğeleri, "PivotRadar" markası ve logosu; 5846 sayılı Fikir ve Sanat Eserleri Kanunu ile 556 sayılı Markaların Korunması Hakkında Kanun Hükmünde Kararname kapsamında koruma altındadır.

Kullanıcıya, Platform'u kişisel amaçlarla kullanmak üzere sınırlı, devredilemez, münhasır olmayan bir lisans tanınmaktadır. Bu lisans; Platform içeriklerinin ticari amaçla çoğaltılması, dağıtılması, değiştirilmesi veya türev eserler oluşturulması için kullanılamaz.

8. HİZMET DEĞİŞİKLİKLERİ VE ASKIYA ALMA

Platform, hizmet kapsamını, özelliklerini veya teknik gereksinimlerini önceden haber vermeksizin değiştirme hakkını saklı tutar. Planlı bakım çalışmaları makul ölçüde önceden duyurulmaya çalışılır; ancak acil teknik müdahaleler için bu yükümlülük geçerli değildir. Platform'un tamamen sona erdirilmesi durumunda kullanıcılara en az 30 gün öncesinden bildirim yapılır.

9. KOŞULLARDA DEĞİŞİKLİK

Platform, bu Koşulları herhangi bir zamanda revize etme hakkını saklı tutar. Değişiklikler, Platform üzerinde yayımlandığı andan itibaren yürürlüğe girer. Kullanıcının değişiklikten haberdar olmakla yükümlü olduğu kabul edilir; Platform'u kullanmaya devam etmek, güncel Koşulların kabul edildiği anlamına gelir. Önemli değişiklikler kayıtlı e-posta adresine iletilmek üzere makul çaba gösterilir.

10. UYGULANACAK HUKUK VE YETKİLİ MAHKEME

İşbu Koşullar Türk Hukukuna tabidir. Koşulların uygulanmasından doğan her türlü uyuşmazlıkta İstanbul Mahkemeleri ve İcra Daireleri münhasıran yetkilidir.

11. BÖLÜNEBİLİRLİK

Bu Koşullardan herhangi bir hükmün yetkili mahkeme tarafından geçersiz sayılması, diğer hükümlerin geçerliliğini etkilemez.`,
  },

  kvkk: {
    label: 'KVKK Aydınlatma Metni',
    icon: 'shield_person',
    updated: '2 Haziran 2026',
    content: `KİŞİSEL VERİLERİN KORUNMASI KANUNU KAPSAMINDA AYDINLATMA METNİ

6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") 10. maddesi uyarınca, kişisel verilerinizi işleyen veri sorumlusu sıfatıyla hazırlanan bu Aydınlatma Metni, verilerinizin nasıl toplandığını, işlendiğini ve haklarınızın neler olduğunu açıklamaktadır.

1. VERİ SORUMLUSUNUN KİMLİĞİ

Veri Sorumlusu: PivotRadar
İletişim: info@pivotradar.net

2. İŞLENEN KİŞİSEL VERİLER VE KATEGORİLERİ

Platform'u kullanmanız sırasında aşağıdaki kişisel veri kategorileri işlenmektedir:

KİMLİK VE İLETİŞİM VERİLERİ
— Ad, soyad (isteğe bağlı olarak girilmişse)
— E-posta adresi

İŞLEM GÜVENLİĞİ VERİLERİ (5651 sayılı Kanun kapsamında zorunlu tutulur)
— IP adresi
— Oturum açma/kapatma log kayıtları
— Kullanılan cihaz tipi, işletim sistemi ve tarayıcı bilgisi
— İki faktörlü doğrulama (2FA) kayıtları

PLATFORM KULLANIM VERİLERİ
— Seçilen analiz profili ve strateji tercihleri
— İzleme listesine eklenen semboller
— Portföy girişleri (yalnızca kullanıcının manuel olarak girdiği veriler)
— Tarama geçmişi ve filtre ayarları

Google OAuth ile giriş yapılması durumunda; Google tarafından sağlanan yalnızca e-posta adresi ve profil adı alınmaktadır. Şifre bilgisi PivotRadar sunucularında hiçbir koşulda saklanmaz.

3. KİŞİSEL VERİLERİN İŞLENME AMAÇLARI VE HUKUKİ DAYANAKLARI

Verileriniz aşağıdaki amaçlarla ve hukuki dayanaklarla işlenmektedir:

— Hesap oluşturma ve kimlik doğrulama → Sözleşmenin kurulması ve ifası (KVKK m. 5/2-c)
— Platform hizmetlerinin sunulması ve kişiselleştirilmesi → Sözleşmenin ifası
— Log kaydı tutulması → Kanuni yükümlülük (5651 sayılı Kanun, KVKK m. 5/2-ç)
— Güvenlik açıklarının tespiti ve önlenmesi → Meşru menfaat (KVKK m. 5/2-f)
— Yasal taleplerin yerine getirilmesi → Kanuni yükümlülük
— Hizmet kalitesinin iyileştirilmesi (anonimleştirilmiş kullanım analitiği) → Meşru menfaat

Verileriniz bu amaçların dışında işlenmez. Reklam, pazarlama veya üçüncü taraflara satış amacıyla herhangi bir kişisel veri işlenmez.

4. KİŞİSEL VERİLERİN AKTARILMASI

Kişisel verileriniz ticari amaçla hiçbir üçüncü kişiye satılmaz, kiralanmaz veya devredilmez. Verileriniz yalnızca aşağıdaki sınırlı hallerde aktarılabilir:

— Teknik altyapı ve barındırma (hosting) hizmet sağlayıcıları: Hizmet sunumu için zorunlu teknik aktarım; gizlilik sözleşmesi kapsamında gerçekleştirilir.
— Bulut platformları (Hizmet olarak altyapı — IaaS): Veri işleme sözleşmesi (DPA) imzalanmış sağlayıcılara aktarım.
— Yetkili kamu kurumları ve adli makamlar: SPK, MASAK, Cumhuriyet Savcılığı, mahkemeler vb. yalnızca yasal zorunluluk halinde ve ilgili mevzuat çerçevesinde.
— Cloudflare Turnstile: Bot koruması amacıyla istek bazında doğrulama verisi aktarımı; Cloudflare Gizlilik Politikası geçerlidir.

5. KİŞİSEL VERİLERİN SAKLANMA SÜRELERİ

— Hesap ve kimlik verileri: Hesabın aktif olduğu süre boyunca ve hesap silinmesini takiben 10 yıl (Türk Borçlar Kanunu genel zamanaşımı süresi)
— Güvenlik log kayıtları: 5651 sayılı Kanun gereği asgari 2 yıl, azami 10 yıl
— Kullanım ve tercih verileri: Hesabın aktif olduğu süre; hesap silindiğinde 30 gün içinde imha edilir
— Portföy girdileri: Kullanıcı tarafından silinmedikçe hesap aktif olduğu sürece saklanır

6. İLGİLİ KİŞİNİN HAKLARI (KVKK MADDE 11)

KVKK'nın 11. maddesi uyarınca aşağıdaki haklara sahipsiniz:

(a) Kişisel verilerinizin işlenip işlenmediğini öğrenme,
(b) İşlenmişse buna ilişkin bilgi talep etme,
(c) Verilerin işlenme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme,
(d) Yurt içinde veya yurt dışında kişisel verilerin aktarıldığı üçüncü kişileri bilme,
(e) Kişisel verilerin eksik veya yanlış işlenmesi halinde bunların düzeltilmesini isteme,
(f) KVKK m. 7 çerçevesinde kişisel verilerin silinmesini veya yok edilmesini isteme (Unutulma Hakkı),
(g) (e) ve (f) bentleri uyarınca yapılan işlemlerin, kişisel verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme,
(h) İşlenen verilerin münhasıran otomatik sistemler vasıtasıyla analiz edilmesi suretiyle kişinin aleyhine bir sonucun ortaya çıkmasına itiraz etme,
(i) Kişisel verilerin kanuna aykırı olarak işlenmesi sebebiyle zarara uğranılması halinde zararın giderilmesini talep etme.

Başvuru Yöntemi: Yukarıdaki haklarınızı kullanmak için info@pivotradar.net adresine kayıtlı e-posta adresinizden talebinizi iletebilirsiniz. Başvurular, KVKK m. 13 uyarınca en geç 30 gün içinde yanıtlanacaktır. Talebin ayrıca bir maliyet gerektirmesi durumunda Kişisel Verileri Koruma Kurulu tarafından belirlenen tarife esas alınır.

Kişisel Verileri Koruma Kurulu'na şikâyet: www.kvkk.gov.tr`,
  },

  privacy: {
    label: 'Gizlilik Politikası',
    icon: 'lock',
    updated: '2 Haziran 2026',
    content: `GİZLİLİK VE VERİ GÜVENLİĞİ POLİTİKASI

Bu Gizlilik Politikası, PivotRadar'ın kullanıcı verilerini nasıl topladığını, kullandığını, koruduğunu ve ne durumlarda paylaştığını açıklamaktadır. Politika, KVKK Aydınlatma Metninin tamamlayıcısıdır ve birlikte okunmalıdır.

1. TOPLANAN VERİLER VE TOPLAMA YÖNTEMLERİ

Kullanıcı tarafından doğrudan sağlanan veriler:
— Kayıt formu aracılığıyla: Ad (isteğe bağlı), e-posta adresi, şifre (hash'lenmiş olarak saklanır)
— Google OAuth ile giriş: Yalnızca e-posta adresi ve profil adı
— Platform kullanımı sırasında: Portföy girdileri, izleme listesi, strateji tercihleri

Otomatik olarak toplanan teknik veriler:
— IP adresi ve coğrafi konum (ülke/şehir düzeyi)
— Tarayıcı türü, sürümü ve işletim sistemi
— Oturum süreleri ve sayfa gezinti verileri (anonimleştirilmiş)
— Hata ve performans logları

2. VERİ KULLANIM AMAÇLARI

Toplanan veriler yalnızca şu amaçlarla kullanılır:
— Hesap doğrulama ve güvenli giriş sağlama
— Kullanıcıya kişiselleştirilmiş analiz sunma
— Platform güvenliğini ve istikrarını koruma
— 5651 sayılı Kanun kapsamında yasal log yükümlülüklerini yerine getirme
— Anonim ve toplu olarak: Platform performansını ölçme ve geliştirme

Platform, reklam amaçlı profilleme, hedefli reklamcılık veya üçüncü taraflara veri satışı yapmaz.

3. TEKNİK GÜVENLİK ÖNLEMLERİ

Verilerinizin korunması için uygulanan teknik tedbirler:

— Şifre Güvenliği: Kullanıcı şifreleri düz metin olarak saklanmaz. bcrypt (maliyet faktörü ≥ 12) veya Argon2id algoritmasıyla hash'lenerek tutulur.
— İletişim Güvenliği: Tüm veri trafiği TLS 1.2 ve üzeri protokollerle şifrelenir. HTTP bağlantıları HTTPS'e yönlendirilir.
— Erişim Kontrolü: Kullanıcı verilerine erişim, yalnızca hizmetin gerektirdiği minimum personelle sınırlıdır (least privilege prensibi).
— Bot Koruması: Cloudflare Turnstile ile otomatik saldırı girişimleri engellenir.
— İki Faktörlü Kimlik Doğrulama (2FA): TOTP tabanlı 2FA kullanıcı güvenliğini artırmak amacıyla sunulmaktadır.
— Güvenlik İzleme: Şüpheli giriş denemeleri ve anormal kullanım pattern'leri otomatik olarak tespit edilir.

4. ÜÇÜNCÜ TARAF HİZMETLER VE ENTEGRASYONlar

Platform'da kullanılan harici hizmetler ve veri paylaşım kapsamı:

— Google OAuth (isteğe bağlı): Kullanıcının Google hesabıyla giriş yapması durumunda, yalnızca e-posta adresi ve profil adı alınır. Google'ın Gizlilik Politikası uygulanır.
— Cloudflare Turnstile: Bot tespiti amacıyla istek verisi işlenir. Cloudflare Gizlilik Politikası geçerlidir.
— Piyasa Veri Sağlayıcıları: Finansal verilerin temini için kullanılan üçüncü taraf API'leri kişisel kullanıcı verisi almaz; yalnızca Platform sunucularının IP adresi iletilir.

5. VERİ TAŞINABİLİRLİĞİ VE HESAP SİLME

Veri Taşınabilirliği: Kullanıcılar, Platform'da sakladıkları portföy ve tercih verilerini info@pivotradar.net adresi üzerinden JSON formatında talep edebilir.

Hesap Silme: Kullanıcılar, hesabı dilediğinde kalıcı olarak silebilir. Silme işleminin ardından:
— Aktif platform verileri anında kaldırılır.
— Yedekleme sistemlerindeki veriler 30 gün içinde tamamen imha edilir.
— Yasal saklama yükümlülüğü kapsamındaki log verileri (5651 sayılı Kanun) mevzuatın öngördüğü süre boyunca saklanmaya devam eder.

6. ÇOCUKLARIN GİZLİLİĞİ

Platform, 18 yaşından küçük kişilere yönelik değildir. Platform'un 18 yaşından küçük bireylerin erişimine açılması halinde, ebeveyn veya vasi onayı aranır. 18 yaş altı kullanıcıya ait kişisel verinin farkında olunmaksızın toplandığının tespit edilmesi durumunda ilgili hesap derhal kapatılır ve veriler silinir.

7. POLİTİKA GÜNCELLEMELERİ

Bu Politika'da yapılacak önemli değişiklikler, yürürlüğe girmeden en az 15 gün önce Platform üzerinde duyurulacak ve mümkün olduğunda kayıtlı e-posta adresine bildirilecektir. Değişikliğin yürürlüğe girmesinin ardından Platform'u kullanmaya devam etmek, güncel Politika'yı kabul ettiğiniz anlamına gelir.`,
  },

  cookies: {
    label: 'Çerez Politikası',
    icon: 'cookie',
    updated: '2 Haziran 2026',
    content: `ÇEREZ (COOKIE) POLITIKASI VE AYDINLATMA METNİ

Bu Çerez Politikası, PivotRadar'ın hangi çerezleri kullandığını, bu çerezlerin amacını ve kullanıcıların çerezleri nasıl yönetebileceğini açıklamaktadır. Politika, KVKK Aydınlatma Metni ile birlikte okunmalıdır.

1. ÇEREZ NEDİR?

Çerezler (cookie), web sitelerinin tarayıcınıza bıraktığı küçük metin dosyalarıdır. Oturum çerezleri tarayıcı kapatıldığında silinir; kalıcı çerezler ise belirlenen süre boyunca cihazınızda saklanır. Çerezlere ek olarak, benzer işlev gören "localStorage" ve "sessionStorage" gibi tarayıcı depolama teknolojilerinden de yararlanılmaktadır.

2. KULLANILAN ÇEREZ KATEGORİLERİ

ZORUNLU ÇEREZLER
Bu çerezler Platform'un temel işlevselliği için vazgeçilmezdir. Devre dışı bırakılamazlar.

— Oturum Çerezi (access_token / session_id): Giriş yapıldıktan sonra kimliğinizi güvenli biçimde doğrular. Tarayıcı kapatıldığında otomatik olarak sona erer.
— Yenileme Çerezi (refresh_token): "Beni Hatırla" seçeneği aktifken uzun süreli oturumun devamını sağlar. HttpOnly ve Secure bayraklarıyla saklanır; JavaScript ile erişilemez.
— CSRF Koruma Çerezi: Siteler arası istek sahteciliği (Cross-Site Request Forgery) saldırılarını önler.
— Güvenlik Doğrulama Jetonu (Cloudflare Turnstile): Bot tespiti ve brute-force koruması için kullanılır.

İŞLEVSEL ÇEREZLER VE YEREL DEPOLAMA
Kullanıcı deneyimini kişiselleştirmek amacıyla kullanılır. Tarayıcı ayarlarından silinebilir.

— Strateji Profili Tercihi: Son seçilen analiz profilini (Güvenli Liman, Trend Takip vb.) hatırlar.
— Grafik Ayarları: Mum tipi, aktif göstergeler ve zaman dilimi tercihlerini korur.
— İzleme Listesi: localStorage'da saklanan favori semboller.
— Portföy Verileri: Oturum açmadan kullanım sırasında localStorage'da geçici olarak tutulan portföy girdileri.

ANALİTİK ÇEREZLER
Platform performansını ve kullanıcı davranışlarını anonim olarak ölçmek amacıyla kullanılır. Kişisel tanımlama yapılmaz.

— Anonim Oturum Analizi: Hangi özelliklerin kullanıldığını toplu olarak ölçer; kişisel veri içermez.
— Hata İzleme: Teknik arızaların tespit edilmesi ve giderilmesi için anonimleştirilmiş hata logları.

3. KULLANILMAYAN ÇEREZ TÜRLERİ

PivotRadar aşağıdaki çerez türlerini kesinlikle kullanmaz:

— Reklam Hedefleme Çerezleri (Targeting/Advertising Cookies)
— Üçüncü Taraf Takip Pikselleri (Tracking Pixels)
— Sosyal Medya Profilleme Çerezleri
— Cihaz Parmak İzi (Device Fingerprinting) teknolojileri

4. ÇEREZ SÜRELERİ

— Oturum çerezi: Tarayıcı kapatılınca sona erer
— Yenileme çerezi: Maksimum 30 gün (kullanıcı çıkış yaparsa anında geçersizleşir)
— İşlevsel çerezler: Maksimum 12 ay (kullanıcı silene kadar)
— Analitik çerezler: Anonimleştirilmiş; saklama süresi 90 gün

5. ÇEREZLER NASIL YÖNETİLİR?

Tarayıcı Ayarlarından Yönetim:
Tüm çerezleri silmek veya yeni çerez kabul etmeyi engellemek için:
— Chrome: Ayarlar → Gizlilik ve Güvenlik → Çerezler
— Firefox: Tercihler → Gizlilik ve Güvenlik → Çerezler
— Safari: Tercihler → Gizlilik → Çerezler

UYARI: Zorunlu çerezlerin engellenmesi veya silinmesi durumunda Platform'a giriş yapılamaz ve temel işlevler çalışmayabilir. Oturum çerezinin silinmesi, mevcut oturumu sonlandırır.

Hesap Silme: Hesabınızı sildiğinizde, sunucu tarafındaki tüm oturum verileri anında geçersizleştirilir ve 30 gün içinde kalıcı olarak imha edilir.

6. POLİTİKA GÜNCELLEMELERİ

Çerez Politikası'nda yapılacak önemli değişiklikler, yürürlüğe girmeden önce Platform üzerinden duyurulacaktır. Güncel politikaya her zaman bu sayfadan erişilebilir.`,
  },

};

const DOC_ORDER = ['terms', 'kvkk', 'privacy', 'cookies'];

export default function LegalPage() {
  const { doc } = useParams();
  const navigate = useNavigate();
  const active = DOCS[doc] ? doc : 'terms';
  const current = DOCS[active];

  useEffect(() => {
    if (!DOCS[doc]) navigate('/legal/terms', { replace: true });
  }, [doc]);

  return (
    <div className="min-h-screen bg-transparent text-[#f0f2ff] font-body antialiased">
      <Helmet>
        <title>{`${current.label} | PivotRadar Yasal Bildirimler`}</title>
        <meta name="description" content={`PivotRadar ${current.label.toLowerCase()} metni. Borsa İstanbul analizi kullanım şartları, gizlilik politikası ve çerez bildirimleri.`} />
        <link rel="canonical" href={`https://pivot-radar.com/legal/${active}`} />
      </Helmet>
      {/* Top bar */}
      <div className="border-b border-white/[0.05] bg-white/[0.02] backdrop-blur-2xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <BrandLogo size="sm" />
          </Link>
          <Link to="/" className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors">
            <span className="material-symbols-outlined text-[15px]">arrow_back</span>
            Ana Sayfa
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-12 flex flex-col lg:flex-row gap-10">
        {/* Sidebar nav */}
        <aside className="lg:w-56 shrink-0">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-4 px-1">Belgeler</p>
          <nav className="space-y-1 p-2 rounded-2xl border border-white/[0.05] bg-white/[0.02] backdrop-blur-xl">
            {DOC_ORDER.map(key => {
              const d = DOCS[key];
              const isActive = key === active;
              return (
                <Link
                  key={key}
                  to={`/legal/${key}`}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                    isActive
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>{d.icon}</span>
                  <span className="font-semibold text-[12px]">{d.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Document content */}
        <motion.main
          key={active}
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex-1 min-w-0"
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-primary text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>{current.icon}</span>
            <h1 className="text-2xl font-black tracking-tighter uppercase">{current.label}</h1>
          </div>
          <p className="text-[10px] text-white/25 font-mono mb-8">Son güncelleme: {current.updated}</p>

          <div className="prose prose-sm max-w-none">
            {current.content.split('\n\n').map((para, i) => {
              const isHeader = /^\d+\./.test(para.trim()) && para.trim().length < 80;
              if (isHeader) {
                return (
                  <h3 key={i} className="text-[11px] font-black uppercase tracking-[0.2em] text-primary/70 mt-8 mb-3 border-b border-white/[0.05] pb-2">
                    {para.trim()}
                  </h3>
                );
              }
              return (
                <p key={i} className="text-[13px] text-white/50 leading-relaxed mb-4 whitespace-pre-line">
                  {para.trim()}
                </p>
              );
            })}
          </div>

          <div className="mt-12 p-4 rounded-xl bg-amber-400/5 border border-amber-400/10">
            <p className="text-[10px] text-amber-400/60 leading-relaxed">
              <span className="font-black">Sorularınız için:</span>{' '}
              <a href="mailto:info@pivotradar.net" className="underline hover:text-amber-400/80 transition-colors">
                info@pivotradar.net
              </a>
            </p>
          </div>
        </motion.main>
      </div>
    </div>
  );
}
