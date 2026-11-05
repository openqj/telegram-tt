import { memo, useMemo } from '../../lib/teact/teact';

import type { IconName } from '../../types/icons';

import buildClassName from '../../util/buildClassName';

import useLang from '../../hooks/useLang';

import Icon from '../common/icons/Icon';
import Button from '../ui/Button';

import styles from './PrimaryNavigation.module.scss';

type OwnProps = {
  activeTab: number;
  onSwitchTab: (index: number) => void;
};

function PrimaryNavigation({ activeTab, onSwitchTab }: OwnProps) {
  const lang = useLang();
  const tabs = useMemo<{ label: string; icon: IconName }[]>(() => ([
    { label: lang('Chats'), icon: 'message' },
    { label: lang('NavigationAi'), icon: 'ai' },
    { label: lang('NavigationWorkbench'), icon: 'devices-filled' },
    { label: lang('MenuSettings'), icon: 'settings' },
  ]), [lang]);

  return (
    <nav className={styles.root} aria-label={lang('NavigationPrimary')}>
      {tabs.map(({ label, icon }, index) => {
        const isActive = index === activeTab;

        return (
          <Button
            key={icon}
            round
            size="smaller"
            color="translucent"
            className={buildClassName(styles.button, isActive && styles.active)}
            ariaLabel={label}
            ariaSelected={isActive}
            onClick={() => onSwitchTab(index)}
          >
            <Icon name={icon} />
          </Button>
        );
      })}
    </nav>
  );
}

export default memo(PrimaryNavigation);
