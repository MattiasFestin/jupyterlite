// Copyright (c) JupyterLite Contributors
// Distributed under the terms of the Modified BSD License.

import * as path from 'path';

import { IJupyterLabPageFixture, test } from '@jupyterlab/galata';

import { expect } from '@playwright/test';

// TODO: upstream in Galata
const deleteItem = async (page: IJupyterLabPageFixture, name: string) => {
  const item = await page.$(`xpath=${page.filebrowser.xpBuildFileSelector(name)}`);
  await item.click({ button: 'right' });
  await page.click('text="Delete"');
  const button = await page.$('.jp-mod-accept');
  await button.click();
};

test.describe('Contents Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('lab/index.html');
  });

  // TODO: Galata should support uploading files via the serviceManager.contents API
  // so it works in JupyterLite
  test.skip('Upload File', async ({ page, tmpPath }) => {
    const file = 'package.json';
    const renamed = 'renamed.json';
    await page.contents.uploadFile(
      path.resolve(__dirname, `../${file}`),
      `${tmpPath}/${file}`
    );
    await page.contents.renameFile(`${tmpPath}/${file}`, `${tmpPath}/${renamed}`);
    expect(await page.contents.fileExists(`${tmpPath}/${renamed}`)).toEqual(true);
  });

  test('Open a file existing on the server', async ({ page }) => {
    const notebook = 'javascript.ipynb';
    await page.notebook.open(notebook);
    expect(await page.notebook.isOpen(notebook)).toBeTruthy();

    await page.notebook.activate(notebook);
    expect(await page.notebook.isActive(notebook)).toBeTruthy();

    await page.notebook.runCellByCell();
  });

  test('Open a file in a subfolder existing on the server', async ({ page }) => {
    const file = 'data/iris.csv';
    await page.filebrowser.open(file);
    expect(
      await page.filebrowser.isFileListedInBrowser(path.basename(file))
    ).toBeTruthy();
  });

  test('Create a new notebook, edit and reload', async ({ page }) => {
    const name = await page.notebook.createNew();

    await page.notebook.setCell(0, 'markdown', '## This is a markdown cell');
    await page.notebook.addCell('raw', 'This is a raw cell');
    await page.notebook.addCell('code', '2 + 2');

    await page.notebook.run();
    await page.notebook.save();

    expect((await page.notebook.getCellTextOutput(2))![0]).toBe('4');

    await page.reload();
    expect(
      await page.filebrowser.isFileListedInBrowser(path.basename(name))
    ).toBeTruthy();

    await page.notebook.open(name);

    expect((await page.notebook.getCellTextOutput(2))![0]).toBe('4');
  });

  test('Create a new notebook and delete it', async ({ page }) => {
    const name = await page.notebook.createNew();
    await page.notebook.close();

    expect(await page.filebrowser.isFileListedInBrowser(name)).toBeTruthy();

    await deleteItem(page, name);
    await page.filebrowser.refresh();

    expect(await page.filebrowser.isFileListedInBrowser(name)).toBeFalsy();
  });

  test('Create a new folder with content and delete it', async ({ page }) => {
    const name = 'Custom Name';

    await page.click('[data-icon="ui-components:new-folder"]');
    await page.fill('.jp-DirListing-editor', name);
    await page.keyboard.down('Enter');
    await page.filebrowser.refresh();

    expect(await page.filebrowser.isFileListedInBrowser(name)).toBeTruthy();

    await page.filebrowser.openDirectory(name);
    await page.notebook.createNew();
    await page.notebook.close();
    await page.filebrowser.openHomeDirectory();
    await deleteItem(page, name);
    await page.filebrowser.refresh();

    expect(await page.filebrowser.isFileListedInBrowser(name)).toBeFalsy();

    await page.waitForTimeout(5000);
  });
});