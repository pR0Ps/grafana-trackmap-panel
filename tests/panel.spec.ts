import { test, expect } from '@grafana/plugin-e2e';

test('panels should be defined', async ({ gotoPanelEditPage, readProvisionedDashboard }) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const panel1EditPage = await gotoPanelEditPage({ dashboard, id: '1' });
  await expect(panel1EditPage.panel.locator).toBeDefined();

  const panel2EditPage = await gotoPanelEditPage({ dashboard, id: '2' });
  await expect(panel2EditPage.panel.locator).toBeDefined();
});
