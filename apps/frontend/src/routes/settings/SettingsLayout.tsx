import { Outlet } from '@tanstack/react-router';
import { PageHeader } from '../../components/shell/PageHeader';
import { TabsNav } from '../../components/ui/tabs';

export function SettingsLayout() {
  return (
    <>
      <PageHeader title="Settings" />
      <TabsNav
        items={[
          { label: 'Account', to: '/settings/account' },
          { label: 'Cost rates', to: '/settings/cost-rates' },
          { label: 'Integration', to: '/settings/integration' },
          { label: 'Low-stock', to: '/settings/low-stock' },
          { label: 'Backup', to: '/settings/backup' },
        ]}
      />
      <div className="mt-6 max-w-2xl">
        <Outlet />
      </div>
    </>
  );
}
