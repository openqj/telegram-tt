import { memo } from '../../../../lib/teact/teact';

import type { TabWithProperties } from '../../../ui/TabList';

import useLang from '../../../../hooks/useLang';

import TabList from '../../../ui/TabList';

export type FolderScope = 'chats' | 'ai' | 'paseo';

type OwnProps = {
  scope: FolderScope;
  onChange: (scope: FolderScope) => void;
};

const SettingsFolderScopeTabs = ({ scope, onChange }: OwnProps) => {
  const lang = useLang();
  const scopes: FolderScope[] = ['chats', 'ai', 'paseo'];
  const tabs: TabWithProperties[] = [
    { title: lang('FilterChats') },
    { title: lang('NavigationAi') },
    { title: lang('NavigationWorkbench') },
  ];

  return (
    <TabList
      className="mb-3"
      tabs={tabs}
      activeTab={scopes.indexOf(scope)}
      onSwitchTab={(index) => {
        const nextScope = scopes[index];
        if (nextScope) onChange(nextScope);
      }}
    />
  );
};

export default memo(SettingsFolderScopeTabs);
