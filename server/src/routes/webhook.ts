import crypto from 'node:crypto';
import { Router, raw } from 'express';
import { config } from '../config';
import { db, type ContractRow } from '../db';
import { logEvent } from '../logger';
import { atualizarStatus } from '../contracts';

export const webhookRouter = Router();

// Recebe o corpo cru para validar a assinatura HMAC do Autentique.
webhookRouter.post('/autentique', raw({ type: '*/*', limit: '2mb' }), async (req, res) => {
  const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

  // Validação HMAC (só se o segredo estiver configurado)
  if (config.autentiqueWebhookSecret) {
    const assinatura = String(req.header('X-Autentique-Signature') || '');
    const esperado = crypto
      .createHmac('sha256', config.autentiqueWebhookSecret)
      .update(rawBody)
      .digest('hex');
    const ok =
      assinatura.length === esperado.length &&
      crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperado));
    if (!ok) {
      logEvent('webhook_assinatura_invalida', { recebida: assinatura.slice(0, 12) });
      return res.status(401).json({ error: 'assinatura inválida' });
    }
  }

  // Responde rápido; processa em seguida.
  res.status(200).json({ received: true });

  try {
    const payload = JSON.parse(rawBody.toString('utf8') || '{}');
    const event = payload.event ?? payload;
    const tipo: string = event.type ?? 'desconhecido';
    const obj = event.data?.object ?? {};

    // Extrai o id do documento, seja evento de documento ou de assinatura.
    const documentId: string | undefined =
      (tipo.startsWith('document') ? obj.id : obj.document?.id) ?? obj.document_id;

    logEvent('webhook_recebido', { tipo, documentId });

    if (documentId) {
      const contrato = db
        .prepare(`SELECT id FROM contracts WHERE autentique_document_id = ?`)
        .get(documentId) as Pick<ContractRow, 'id'> | undefined;
      if (contrato) {
        await atualizarStatus(contrato.id);
      }
    }
  } catch (err: any) {
    logEvent('webhook_erro', { mensagem: String(err?.message ?? err) });
  }
});
