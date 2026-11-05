import { memo, useEffect, useState } from '../../../lib/teact/teact';

import type {
  ApiAgentComposerConfig, ApiAgentServer, ApiAgentServerInput, ApiAgentServerStatus,
} from '../../../api/types';

import {
  fetchAgentServers, fetchAgentServerStatus, saveAgentServer,
} from '../../../util/agentComposerConfig';
import buildClassName from '../../../util/buildClassName';

import useAppLayout from '../../../hooks/useAppLayout';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Island, { IslandDescription } from '../../gili/layout/Island';
import Button from '../../ui/Button';
import InputText from '../../ui/InputText';
import Modal from '../../ui/Modal';

import styles from './AgentServerManagerQuickActions.module.scss';
import attachmentModalStyles from './AttachmentModal.module.scss';

type OwnProps = {
  botUserId: string;
  config: ApiAgentComposerConfig;
  requestedAction?: string;
  onRequestedActionHandled: NoneToVoidFunction;
};

type ModalMode = 'add' | 'status';

const AgentServerManagerQuickActions = ({
  botUserId,
  config,
  requestedAction,
  onRequestedActionHandled,
}: OwnProps) => {
  const lang = useLang();
  const { isMobile } = useAppLayout();
  const [mode, setMode] = useState<ModalMode>();
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hostKeyFingerprint, setHostKeyFingerprint] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [servers, setServers] = useState<ApiAgentServer[]>([]);
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [serverListFailed, setServerListFailed] = useState(false);
  const [checkingServerId, setCheckingServerId] = useState<string>();
  const [status, setStatus] = useState<ApiAgentServerStatus>();
  const [statusCheckFailed, setStatusCheckFailed] = useState(false);

  const canSave = Boolean(name.trim() && host.trim() && username.trim() && password
    && hostKeyFingerprint.trim() && Number.isInteger(Number(port))
    && Number(port) >= 1 && Number(port) <= 65535 && !isSaving);
  const modalTitle = mode === 'add' ? lang('ServerManagerAddServer') : lang('ServerManagerStatus');
  const isAddActionAvailable = config.quickActions?.includes('add_server');
  const isStatusActionAvailable = config.quickActions?.includes('server_status');

  useEffect(() => {
    if (!requestedAction) return;

    if (requestedAction === 'add_server') setMode('add');
    if (requestedAction === 'server_status') setMode('status');
    onRequestedActionHandled();
  }, [onRequestedActionHandled, requestedAction]);

  useEffect(() => {
    if (mode !== 'status') return undefined;

    let isActive = true;
    setIsLoadingServers(true);
    setServerListFailed(false);
    setStatusCheckFailed(false);
    fetchAgentServers(botUserId).then((result) => {
      if (!isActive) return;
      setServers(result || []);
      setServerListFailed(!result);
    }).catch(() => {
      if (isActive) setServerListFailed(true);
    }).finally(() => {
      if (isActive) setIsLoadingServers(false);
    });

    return () => {
      isActive = false;
    };
  }, [botUserId, mode]);

  useEffect(() => {
    if (mode) return;

    setName('');
    setHost('');
    setPort('22');
    setUsername('');
    setPassword('');
    setHostKeyFingerprint('');
    setSaveFailed(false);
    setServerListFailed(false);
    setServers([]);
    setStatus(undefined);
  }, [mode]);

  const handleClose = useLastCallback(() => setMode(undefined));
  const handleStatusView = useLastCallback(() => setMode('status'));
  const handleAddView = useLastCallback(() => setMode('add'));
  const handleSave = useLastCallback(async () => {
    if (!canSave) return;

    setIsSaving(true);
    setSaveFailed(false);
    const server: ApiAgentServerInput = {
      name: name.trim(),
      host: host.trim(),
      port: Number(port),
      username: username.trim(),
      password,
      hostKeyFingerprint: hostKeyFingerprint.trim(),
    };
    try {
      const result = await saveAgentServer(botUserId, server);
      if (!result) throw new Error('empty server save result');
      handleStatusView();
    } catch {
      setSaveFailed(true);
    } finally {
      setIsSaving(false);
      setPassword('');
    }
  });

  const handleCheckStatus = useLastCallback(async (serverId: string) => {
    setCheckingServerId(serverId);
    setStatus(undefined);
    setStatusCheckFailed(false);
    try {
      const result = await fetchAgentServerStatus(botUserId, serverId);
      if (!result) throw new Error('empty server status result');
      setStatus(result);
    } catch {
      const server = servers.find((item) => item.id === serverId);
      if (server) {
        setStatus({
          server,
          status: 'error',
          errorCode: 'server_status_unavailable',
          checkedAt: new Date().toISOString(),
        });
      } else {
        setStatusCheckFailed(true);
      }
    } finally {
      setCheckingServerId(undefined);
    }
  });

  const serverCount = servers.length;
  const handleHeaderAction = mode === 'add' ? handleSave : handleAddView;

  return (
    <>
      <div className={styles.quickActions}>
        {isAddActionAvailable && (
          <Button
            color="translucent"
            size="smaller"
            pill
            noForcedUpperCase
            onClick={handleAddView}
          >
            {lang('ServerManagerAddServer')}
          </Button>
        )}
        {isStatusActionAvailable && (
          <Button
            color="translucent"
            size="smaller"
            pill
            noForcedUpperCase
            onClick={handleStatusView}
          >
            {lang('ServerManagerStatus')}
          </Button>
        )}
      </div>

      <Modal
        isOpen={Boolean(mode)}
        onClose={handleClose}
        className={buildClassName(attachmentModalStyles.root, isMobile && attachmentModalStyles.mobile)}
        isSlim
        isBottomSheet
        header={(
          <div className="modal-header-condensed-wide" dir={lang.isRtl ? 'rtl' : undefined}>
            <Button
              round
              color="translucent"
              size="tiny"
              ariaLabel={lang('AriaCloseAttachmentModal')}
              onClick={handleClose}
              iconName="close"
            />
            <div className="modal-title">{modalTitle}</div>
            <Button
              color="primary"
              pill
              size="smaller"
              noForcedUpperCase
              disabled={mode === 'add' && !canSave}
              onClick={handleHeaderAction}
            >
              {mode === 'add' ? lang('Save') : lang('ServerManagerAddServer')}
            </Button>
          </div>
        )}
        noBackdropClose
        noTitleAutoFocus
      >
        {mode === 'add' ? (
          <>
            <Island className={styles.formIsland}>
              <InputText label={lang('ServerManagerName')} value={name} onChange={(e) => setName(e.target.value)} />
              <InputText label={lang('ServerManagerHost')} value={host} onChange={(e) => setHost(e.target.value)} />
              <InputText
                label={lang('ServerManagerPort')}
                inputMode="numeric"
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
              <InputText
                label={lang('ServerManagerUsername')}
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <InputText
                type="password"
                label={lang('ServerManagerPassword')}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <InputText
                label={lang('ServerManagerHostKey')}
                value={hostKeyFingerprint}
                onChange={(e) => setHostKeyFingerprint(e.target.value)}
              />
              <IslandDescription>{lang('ServerManagerHostKeyHelp')}</IslandDescription>
            </Island>
            {saveFailed && <div className={styles.error} role="alert">{lang('ServerManagerSaveFailed')}</div>}
          </>
        ) : (
          <>
            {isLoadingServers && <div className={styles.message}>{lang('ServerManagerChecking')}</div>}
            {serverListFailed && <div className={styles.error} role="alert">{lang('ServerManagerStatusFailed')}</div>}
            {statusCheckFailed && (
              <div className={styles.error} role="alert">
                {lang('ServerManagerStatusFailed')}
                {' (server_status_unavailable)'}
              </div>
            )}
            {!isLoadingServers && !serverListFailed && serverCount === 0 && (
              <div className={styles.message}>{lang('ServerManagerNoServers')}</div>
            )}
            {servers.map((server) => (
              <Island key={server.id} className={styles.serverIsland}>
                <div className={styles.serverRow}>
                  <div className={styles.serverDetails}>
                    <div className={styles.serverName}>{server.name}</div>
                    <div className={styles.serverHost}>
                      {server.username}
                      @
                      {server.host}
                      :
                      {server.port}
                    </div>
                  </div>
                  <Button
                    color="secondary"
                    size="smaller"
                    noForcedUpperCase
                    disabled={Boolean(checkingServerId)}
                    onClick={() => handleCheckStatus(server.id)}
                  >
                    {checkingServerId === server.id ? lang('ServerManagerChecking') : lang('ServerManagerCheck')}
                  </Button>
                </div>
                {status?.server.id === server.id && (
                  <div
                    className={buildClassName(
                      styles.status,
                      status.status === 'error' && styles.error,
                    )}
                    aria-live="polite"
                  >
                    {status.status === 'ok'
                      ? lang('ServerManagerStatusOk')
                      : `${lang('ServerManagerStatusFailed')} (${status.errorCode})`}
                    {status.output && <pre className={styles.output}>{status.output}</pre>}
                  </div>
                )}
              </Island>
            ))}
          </>
        )}
      </Modal>
    </>
  );
};

export default memo(AgentServerManagerQuickActions);
