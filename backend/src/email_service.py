import smtplib
import ssl
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from src.config import settings


def send_password_reset_email(to_email: str, reset_url: str) -> None:
    """Send password reset email via SMTP SSL (port 465)."""
    year = datetime.utcnow().year

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Recuperação de senha — Cyanki"
    msg["From"] = settings.MAIL_SENDER or settings.MAIL_USER
    msg["To"] = to_email

    html = (
        "<!DOCTYPE html><html><body style='font-family:sans-serif;background:#f5f5f5;padding:32px;'>"
        "<div style='max-width:480px;margin:0 auto;background:white;border-radius:16px;padding:40px;box-shadow:0 2px 16px rgba(0,0,0,0.08);'>"
        "<div style='text-align:center;margin-bottom:32px;'>"
        "<div style='display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:#4f46e5;border-radius:12px;'>"
        "<span style='color:white;font-weight:900;font-size:22px;'>C</span></div>"
        "<h1 style='margin:12px 0 0;font-size:22px;color:#111;'>Cyanki</h1></div>"
        "<h2 style='color:#111;margin-bottom:8px;'>Recuperar sua senha</h2>"
        f"<p style='color:#555;line-height:1.6;'>Recebemos uma solicitação para redefinir a senha da conta associada a <strong>{to_email}</strong>.</p>"
        "<p style='color:#555;line-height:1.6;'>Clique no botão abaixo para criar uma nova senha. O link expira em <strong>30 minutos</strong>.</p>"
        "<div style='text-align:center;margin:32px 0;'>"
        f"<a href='{reset_url}' style='background:#4f46e5;color:white;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;display:inline-block;'>Redefinir senha</a></div>"
        "<p style='color:#999;font-size:13px;line-height:1.6;'>Se você não solicitou a recuperação de senha, ignore este e-mail.</p>"
        "<hr style='border:none;border-top:1px solid #eee;margin:24px 0;'/>"
        f"<p style='color:#bbb;font-size:12px;text-align:center;'>© {year} Cyanki · E-mail automático.</p>"
        "</div></body></html>"
    )

    msg.attach(MIMEText(html, "html"))

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(settings.MAIL_SERVER, settings.MAIL_PORT, context=context) as server:
        server.login(settings.MAIL_USER, settings.MAIL_PASSWORD)
        server.sendmail(settings.MAIL_USER, to_email, msg.as_string())
