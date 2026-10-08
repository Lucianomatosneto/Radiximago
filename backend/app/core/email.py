"""
Envio de e-mail (SMTP) - usado pelo fluxo de redefinicao de senha.

Se SMTP_HOST nao estiver configurado (.env), o envio real e pulado e o
conteudo (assunto + link) e so registrado no log - permite testar o fluxo
completo em dev sem precisar de credenciais de e-mail reais. Configurar
SMTP_HOST/SMTP_USER/SMTP_PASSWORD no .env pra envio de verdade.
"""

import logging
from html import escape
import smtplib
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.core.config import settings

logger = logging.getLogger("radix_imago.email")


def enviar_email(
    destinatario: str,
    assunto: str,
    corpo_html: str,
    anexo_bytes: Optional[bytes] = None,
    anexo_nome: Optional[str] = None,
    anexos: Optional[list[tuple[bytes, str]]] = None,
) -> None:
    lista_anexos = list(anexos or [])
    if anexo_bytes:
        lista_anexos.append((anexo_bytes, anexo_nome or "imagem.png"))

    if not settings.SMTP_HOST:
        logger.info(
            "SMTP_HOST nao configurado - e-mail NAO enviado de verdade. "
            "Destinatario=%s Assunto=%r Corpo=%s Anexos=%s",
            destinatario, assunto, corpo_html, [nome for _, nome in lista_anexos],
        )
        return

    mensagem = MIMEMultipart("mixed")
    mensagem["Subject"] = assunto
    mensagem["From"] = settings.SMTP_FROM
    mensagem["To"] = destinatario

    corpo = MIMEMultipart("alternative")
    corpo.attach(MIMEText(corpo_html, "html", "utf-8"))
    mensagem.attach(corpo)

    for conteudo, nome_arquivo in lista_anexos:
        anexo = MIMEImage(conteudo)
        anexo.add_header("Content-Disposition", "attachment", filename=nome_arquivo)
        mensagem.attach(anexo)

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as servidor:
        if settings.SMTP_USE_TLS:
            servidor.starttls()
        if settings.SMTP_USER:
            servidor.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        servidor.sendmail(settings.SMTP_FROM, [destinatario], mensagem.as_string())


def enviar_email_redefinicao_senha(destinatario: str, nome: str, link_reset: str, idioma: str = "pt") -> None:
    if idioma == "en":
        assunto = "Password reset - Radix Imago"
        corpo_html = f"""
        <p>Hello, {escape(nome)}.</p>
        <p>We received a request to reset the password for your Radix Imago account.</p>
        <p><a href="{link_reset}">Click here to set a new password</a></p>
        <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        """
    else:
        assunto = "Redefinição de senha - Rádix Imago"
        corpo_html = f"""
        <p>Olá, {escape(nome)}.</p>
        <p>Recebemos uma solicitação para redefinir a senha da sua conta no Rádix Imago.</p>
        <p><a href="{link_reset}">Clique aqui para definir uma nova senha</a></p>
        <p>Esse link expira em 1 hora. Se você não solicitou isso, pode ignorar este e-mail.</p>
        """
    enviar_email(destinatario, assunto, corpo_html)


def enviar_email_confirmacao_cadastro(
    destinatario: str, nome: str, link_confirmacao: str, validade_horas: int
) -> None:
    """Primeira etapa do cadastro: prova de que a pessoa e dona do e-mail."""
    corpo_html = f"""
    <p>Olá, {escape(nome)}.</p>
    <p>Recebemos um pedido de acesso ao Rádix Imago usando este e-mail.</p>
    <p>Para continuar, confirme seu e-mail. Na página que abrir, digite a
    <strong>mesma senha</strong> que você definiu no formulário.</p>
    <p><a href="{escape(link_confirmacao, quote=True)}">Confirmar meu e-mail</a></p>
    <p>O link vale por {validade_horas} horas e só pode ser usado uma vez.</p>
    <p>Se não foi você quem fez esse pedido, ignore este e-mail: sem a
    confirmação, nenhum acesso é liberado.</p>
    """
    enviar_email(destinatario, "Confirme seu e-mail - Rádix Imago", corpo_html)


def enviar_email_solicitacao_recebida(destinatario: str, nome: str) -> None:
    corpo_html = f"""
    <p>Olá, {escape(nome)}.</p>
    <p>Seu e-mail foi confirmado e sua solicitação de acesso ao Rádix Imago foi
    encaminhada. Um administrador vai revisar o pedido em breve, e você será
    avisado por e-mail quando ele for aprovado.</p>
    """
    enviar_email(destinatario, "Solicitação de acesso recebida - Rádix Imago", corpo_html)


def enviar_email_acesso_aprovado(destinatario: str, nome: str) -> None:
    corpo_html = f"""
    <p>Olá, {escape(nome)}.</p>
    <p>Sua solicitação de acesso ao Rádix Imago foi aprovada. Você já pode entrar
    usando o e-mail e a senha que definiu na solicitação.</p>
    <p><a href="{settings.FRONTEND_URL}/login">Acessar o Rádix Imago</a></p>
    """
    enviar_email(destinatario, "Acesso aprovado - Rádix Imago", corpo_html)


def enviar_email_imagem_pesquisa(
    destinatario: str, nome: str, descricao: str, anexo_bytes: bytes, anexo_nome: str
) -> None:
    corpo_html = f"""
    <p>Olá, {escape(nome)}.</p>
    <p>Segue em anexo a imagem que você selecionou na Pesquisa avançada do Rádix Imago.</p>
    <p><strong>{escape(descricao)}</strong></p>
    """
    enviar_email(
        destinatario, "Imagem da Pesquisa - Rádix Imago", corpo_html,
        anexo_bytes=anexo_bytes, anexo_nome=anexo_nome,
    )


def enviar_email_imagens_pesquisa_lote(
    destinatario: str, nome: str, itens: list[tuple[str, bytes, str]]
) -> None:
    """
    Envia varias imagens selecionadas (ex.: em "Minhas imagens") num unico
    e-mail, uma anexada por vez.

    itens: lista de (descricao, anexo_bytes, anexo_nome), uma entrada por
    imagem selecionada. O chamador e responsavel por garantir que nenhuma
    delas seja uma serie com varios cortes (ex.: tomografia) - series nao
    sao enviadas por e-mail, so por download em ZIP.
    """
    linhas_descricao = "".join(f"<li>{escape(descricao)}</li>" for descricao, _, _ in itens)
    corpo_html = f"""
    <p>Olá, {escape(nome)}.</p>
    <p>Seguem em anexo as {len(itens)} imagens que você selecionou no Rádix Imago.</p>
    <ul>{linhas_descricao}</ul>
    """
    enviar_email(
        destinatario, "Imagens selecionadas - Rádix Imago", corpo_html,
        anexos=[(anexo_bytes, anexo_nome) for _, anexo_bytes, anexo_nome in itens],
    )


def enviar_email_acesso_rejeitado(destinatario: str, nome: str, motivo: str) -> None:
    corpo_html = f"""
    <p>Olá, {escape(nome)}.</p>
    <p>Sua solicitação de acesso ao Rádix Imago não foi aprovada.</p>
    <p><strong>Motivo:</strong> {escape(motivo)}</p>
    """
    enviar_email(destinatario, "Solicitação de acesso não aprovada - Rádix Imago", corpo_html)
