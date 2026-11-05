import { Api as GramJs } from '../../../lib/gramjs';

import type { ApiAppConfig, ApiConfig, ApiPromoData } from '../../types';

import { buildAppConfig } from '../apiBuilders/appConfig';
import { buildApiConfig, buildApiPromoData, buildJson } from '../apiBuilders/misc';
import { DEFAULT_PRIMITIVES } from '../gramjsBuilders';
import { invokeRequest } from './client';

export async function fetchAppConfig({ hash }: { hash?: number }): Promise<ApiAppConfig | undefined> {
  const result = await invokeRequest(new GramJs.help.GetAppConfig({ hash: hash ?? DEFAULT_PRIMITIVES.INT }));
  if (!result || result instanceof GramJs.help.AppConfigNotModified) return undefined;

  const { config, hash: resultHash } = result;
  return buildAppConfig(config, resultHash);
}

export async function fetchPaseoIdentitySession(): Promise<{
  accessToken: string;
  accountId: string;
  expiresIn: number;
  identityUrl: string;
  workbenchAccessToken: string;
  workbenchExpiresIn: number;
} | undefined> {
  const result = await invokeRequest(new GramJs.help.GetAppConfig({ hash: -1196575574 }));
  if (!result || result instanceof GramJs.help.AppConfigNotModified) return undefined;

  const config = buildJson(result.config) as Record<string, unknown>;
  const session = config.paseo_identity_session as Record<string, unknown> | undefined;
  if (!session || typeof session.access_token !== 'string' || typeof session.account_id !== 'string' ||
    typeof session.expires_in !== 'number' || typeof session.identity_url !== 'string' ||
    typeof session.workbench_access_token !== 'string' || typeof session.workbench_expires_in !== 'number') {
    throw new Error('A Paseo Relay identity session is unavailable for this Telegram account');
  }

  return {
    accessToken: session.access_token,
    accountId: session.account_id,
    expiresIn: session.expires_in,
    identityUrl: session.identity_url,
    workbenchAccessToken: session.workbench_access_token,
    workbenchExpiresIn: session.workbench_expires_in,
  };
}

export async function fetchConfig(): Promise<ApiConfig | undefined> {
  const result = await invokeRequest(new GramJs.help.GetConfig());
  if (!result) return undefined;

  return buildApiConfig(result);
}

export async function fetchPromoData(): Promise<ApiPromoData | undefined> {
  const result = await invokeRequest(new GramJs.help.GetPromoData());
  if (!result || result instanceof GramJs.help.PromoDataEmpty) return undefined;

  return buildApiPromoData(result);
}

export async function dismissSuggestion(suggestion: string): Promise<void> {
  await invokeRequest(new GramJs.help.DismissSuggestion({
    peer: new GramJs.InputPeerEmpty(),
    suggestion,
  }));
}
