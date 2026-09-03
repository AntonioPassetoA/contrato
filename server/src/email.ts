import { config } from './config';
import { logEvent } from './logger';

/**
 * Envio de e-mail ao CLIENTE com o link de assinatura (Opção A).
 *
 * Fluxo: a Autentique dispara pelo WhatsApp (canal do signatário) e o NOSSO
 * sistema envia o MESMO link de assinatura por e-mail. Como é o mesmo link do
 * mesmo signatário, o cliente assina uma única vez, por qualquer um dos canais.
 *
 * ⚠️ Ainda NÃO há serviço de e-mail configurado. Este módulo está estruturado,
 * mas INERTE: apenas registra a intenção de envio, sem enviar nada. Assim que o
 * serviço for definido (SMTP do Workspace ou um provedor) e as credenciais forem
 * fornecidas por você, a implementação real do envio entra aqui — sem mudar o
 * ponto que chama esta função.
 */

export function emailConfigurado(): boolean {
  return config.emailConfigurado;
}

export interface EnvioLinkInput {
  para?: string;
  nome: string;
  link: string | null;
  contractId?: number | null;
}

export async function enviarLinkAssinatura(
  input: EnvioLinkInput,
): Promise<{ enviado: boolean; motivo?: string }> {
  const contractId = input.contractId ?? null;

  if (!input.para || !input.link) {
    logEvent('email_link_ignorado', { motivo: 'sem_email_ou_link', para: input.para }, contractId);
    return { enviado: false, motivo: 'sem_email_ou_link' };
  }

  if (!emailConfigurado()) {
    // Ponto de integração pronto; aguardando definição do serviço de e-mail.
    logEvent('email_nao_configurado', { para: input.para, link: input.link }, contractId);
    return { enviado: false, motivo: 'servico_nao_configurado' };
  }

  // TODO(pós-autorização): enviar o e-mail de verdade (SMTP ou provedor) com o
  // assunto "Seu contrato para assinatura" e o botão/link `input.link`.
  logEvent('email_link_pendente_implementacao', { para: input.para }, contractId);
  return { enviado: false, motivo: 'envio_nao_implementado' };
}
