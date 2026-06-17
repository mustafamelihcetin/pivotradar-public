# backend/app/core/email.py
"""
Email utility — sends transactional emails via SMTP.
Required env vars: SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM, APP_URL
"""
from app.core import settings
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

SMTP_HOST     = settings.SMTP_HOST
SMTP_PORT     = settings.SMTP_PORT
SMTP_USERNAME = settings.SMTP_USERNAME
SMTP_PASSWORD = settings.SMTP_PASSWORD
SMTP_FROM     = settings.SMTP_FROM
APP_URL       = settings.APP_URL


def _base_template(content_html: str, preheader: str = "") -> str:
    """Wraps content in a stylish PivotRadar branded HTML email template."""
    return f"""<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PivotRadar</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#05070a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <span style="display:none;font-size:1px;color:#05070a;max-height:0;overflow:hidden;">{preheader}</span>

  <!-- Email wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#05070a;min-height:100vh;">
    <tr>
      <td align="center" valign="top" style="padding:40px 16px;">

        <!-- Card -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:32px;text-align:center;">
              <table cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td style="background:#0a0d12;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 24px;">
                    <span style="font-size:24px;font-weight:900;letter-spacing:-0.5px;color:#ffffff;text-transform:uppercase;">
                      &#9678;&nbsp;PIVOTRADAR
                    </span>
                    <br>
                    <span style="font-size:10px;letter-spacing:3px;color:rgba(34,211,238,0.5);text-transform:uppercase;font-weight:700;">QUANT TERMINAL v4.1</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content card -->
          <tr>
            <td style="background:linear-gradient(145deg,#0a0d12,#0c0f15);border:1px solid rgba(255,255,255,0.06);border-radius:20px;overflow:hidden;">
              <!-- Accent bar -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="height:3px;background:linear-gradient(90deg,#22d3ee,#67e8f9,#a5f3fc);"></td>
                </tr>
              </table>

              <!-- Content -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:40px 40px 32px;">
                    {content_html}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:28px;text-align:center;">
              <p style="margin:0 0 8px;font-size:11px;color:rgba(255,255,255,0.2);font-family:monospace;text-transform:uppercase;letter-spacing:2px;">
                PIVOTRADAR &bull; QUANT TERMINAL
              </p>
              <p style="margin:0;font-size:10px;color:rgba(255,255,255,0.1);font-family:monospace;">
                Bu platform yatırım tavsiyesi vermez. Tüm analizler teknik gösterge tabanlıdır.
              </p>
              <p style="margin:8px 0 0;font-size:10px;color:rgba(255,255,255,0.08);font-family:monospace;">
                &copy; 2026 PivotRadar
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def verification_email_html(name: str, verify_url: str) -> str:
    content = f"""
      <!-- Icon -->
      <div style="text-align:center;margin-bottom:28px;">
        <div style="display:inline-block;width:56px;height:56px;background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.25);border-radius:16px;line-height:56px;text-align:center;">
          <span style="font-size:28px;">&#9993;</span>
        </div>
      </div>

      <h1 style="margin:0 0 8px;font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;text-align:center;">
        E-Posta Adresinizi Doğrulayın
      </h1>
      <p style="margin:0 0 28px;font-size:14px;color:rgba(255,255,255,0.45);text-align:center;line-height:1.6;">
        Merhaba{' ' + name if name else ''},<br>
        PivotRadar hesabınıza hoş geldiniz. Hesabınızı etkinleştirmek için aşağıdaki butona tıklayın.
      </p>

      <!-- CTA Button -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding-bottom:28px;">
            <a href="{verify_url}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#22d3ee,#67e8f9);color:#003d42;font-size:13px;font-weight:900;text-decoration:none;border-radius:12px;letter-spacing:1px;text-transform:uppercase;box-shadow:0 8px 24px rgba(34,211,238,0.3);">
              &#10003;&nbsp; E-Postamı Doğrula
            </a>
          </td>
        </tr>
      </table>

      <!-- Divider -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="height:1px;background:rgba(255,255,255,0.06);"></td></tr>
      </table>

      <!-- URL fallback -->
      <p style="margin:20px 0 0;font-size:11px;color:rgba(255,255,255,0.25);text-align:center;line-height:1.6;">
        Buton çalışmıyorsa bu bağlantıyı kopyalayıp tarayıcınıza yapıştırın:<br>
        <a href="{verify_url}" style="color:rgba(34,211,238,0.6);word-break:break-all;">{verify_url}</a>
      </p>
      <p style="margin:12px 0 0;font-size:11px;color:rgba(255,255,255,0.2);text-align:center;">
        Bu bağlantı 24 saat geçerlidir.
      </p>
    """
    return _base_template(content, preheader="PivotRadar hesabınızı doğrulayın — linke tıklayın.")


def reset_password_email_html(name: str, reset_url: str) -> str:
    content = f"""
      <!-- Icon -->
      <div style="text-align:center;margin-bottom:28px;">
        <div style="display:inline-block;width:56px;height:56px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.25);border-radius:16px;line-height:56px;text-align:center;">
          <span style="font-size:28px;">&#128274;</span>
        </div>
      </div>

      <h1 style="margin:0 0 8px;font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;text-align:center;">
        Şifre Sıfırlama Talebi
      </h1>
      <p style="margin:0 0 28px;font-size:14px;color:rgba(255,255,255,0.45);text-align:center;line-height:1.6;">
        Merhaba{' ' + name if name else ''},<br>
        Şifrenizi sıfırlamak için bir talep aldık. Aşağıdaki butona tıklayarak yeni şifrenizi belirleyin.
      </p>

      <!-- CTA Button -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding-bottom:28px;">
            <a href="{reset_url}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#fbbf24,#fde68a);color:#422006;font-size:13px;font-weight:900;text-decoration:none;border-radius:12px;letter-spacing:1px;text-transform:uppercase;box-shadow:0 8px 24px rgba(251,191,36,0.3);">
              &#128274;&nbsp; Şifremi Sıfırla
            </a>
          </td>
        </tr>
      </table>

      <!-- Divider -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="height:1px;background:rgba(255,255,255,0.06);"></td></tr>
      </table>

      <!-- Warning -->
      <div style="margin-top:20px;padding:12px 16px;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:10px;">
        <p style="margin:0;font-size:11px;color:rgba(251,191,36,0.7);text-align:center;">
          &#9888; Bu talebi siz başlatmadıysanız bu e-postayı yok sayın. Şifreniz değişmeyecektir.
        </p>
      </div>

      <p style="margin:16px 0 0;font-size:11px;color:rgba(255,255,255,0.25);text-align:center;line-height:1.6;">
        Bu bağlantı 1 saat geçerlidir.<br>
        <a href="{reset_url}" style="color:rgba(34,211,238,0.6);word-break:break-all;">{reset_url}</a>
      </p>
    """
    return _base_template(content, preheader="PivotRadar şifre sıfırlama bağlantısı.")


def temporary_password_email_html(name: str, temp_pw: str) -> str:
    content = f"""
      <!-- Icon -->
      <div style="text-align:center;margin-bottom:28px;">
        <div style="display:inline-block;width:56px;height:56px;background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.25);border-radius:16px;line-height:56px;text-align:center;">
          <span style="font-size:28px;">&#128273;</span>
        </div>
      </div>

      <h1 style="margin:0 0 8px;font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;text-align:center;">
        Geçici Şifreniz Oluşturuldu
      </h1>
      <p style="margin:0 0 28px;font-size:14px;color:rgba(255,255,255,0.45);text-align:center;line-height:1.6;">
        Merhaba{' ' + name if name else ''},<br>
        Yöneticilerimiz tarafından hesabınız için geçici bir şifre tanımlandı. Güvenliğiniz için bu şifre ile giriş yaptıktan sonra yeni bir şifre belirlemeniz gerekecektir.
      </p>

      <!-- Temp PW Box -->
      <div style="background:rgba(34,211,238,0.05);border:1px dashed rgba(34,211,238,0.3);border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
         <p style="margin:0 0 8px;font-size:11px;color:rgba(34,211,238,0.5);text-transform:uppercase;letter-spacing:2px;font-weight:900;"> GEÇİCİ ŞİFRE </p>
         <p style="margin:0;font-size:24px;font-weight:900;color:#67e8f9;letter-spacing:4px;font-family:monospace;">{temp_pw}</p>
      </div>

      <!-- CTA Button -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding-bottom:28px;">
            <a href="{APP_URL}/login" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#22d3ee,#67e8f9);color:#003d42;font-size:13px;font-weight:900;text-decoration:none;border-radius:12px;letter-spacing:1px;text-transform:uppercase;box-shadow:0 8px 24px rgba(34,211,238,0.3);">
              Sisteme Giriş Yap
            </a>
          </td>
        </tr>
      </table>

      <!-- Divider -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="height:1px;background:rgba(255,255,255,0.06);"></td></tr>
      </table>

      <p style="margin:20px 0 0;font-size:11px;color:rgba(255,255,255,0.2);text-align:center;line-height:1.6;">
        Giriş yaptıktan sonra otomatik olarak şifre değiştirme ekranına yönlendirileceksiniz.
      </p>
    """
    return _base_template(content, preheader="Geçici PivotRadar şifreniz hazır.")


def support_email_html(name: str, email: str, subject_form: str, message: str) -> str:
    content = f"""
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">
        Yeni Destek Talebi: {subject_form}
      </h1>
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:12px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:1px;">Gönderen</p>
        <p style="margin:0 0 16px;font-size:14px;color:#ffffff;font-weight:700;">{name} ({email})</p>
        
        <p style="margin:0 0 8px;font-size:12px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:1px;">Mesaj Detayı</p>
        <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.8);line-height:1.6;white-space:pre-wrap;">{message}</p>
      </div>

      <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);text-align:center;">
        Bu mesaj PivotRadar İletişim Formu aracılığıyla gönderilmiştir.
      </p>
    """
    return _base_template(content, preheader=f"Yeni destek talebi: {name} tarafından.")


def send_email(to: str, subject: str, html: str, reply_to: str = None) -> bool:
    """Send an HTML email. Returns True on success, False on failure."""
    if not SMTP_HOST or not SMTP_USERNAME:
        logger.warning("SMTP not configured — email not sent (set SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD env vars).")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"PivotRadar <{SMTP_FROM}>"
    msg["To"]      = to
    if reply_to:
        msg["Reply-To"] = reply_to

    msg.attach(MIMEText(html, "html", "utf-8"))

    logger.info(f"Sending email to {to} via {SMTP_HOST}:{SMTP_PORT}")
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, [to], msg.as_string())
        logger.info(f"Email sent successfully to {to}")
        return True
    except Exception as e:
        logger.error(f"Email send failed to {to}: {e}")
        return False
